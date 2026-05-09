/**
 * StreamFlow — Streaming Service
 * Gerencia a execução de títulos e dispara eventos de visualização.
 */

// 1. INSTRUMENTAÇÃO OPENTELEMETRY (Novo Padrão)
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  serviceName: 'streaming-service',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// 2. DEPENDÊNCIAS
const Fastify = require('fastify');
const Database = require('better-sqlite3');
const amqp = require('amqplib');
const metricsPlugin = require('fastify-metrics');

const app = Fastify({ 
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  } 
});

// Registro de métricas para o Prometheus
app.register(metricsPlugin, { endpoint: '/metrics' });

const PORT = process.env.PORT || 3003;
const DB_PATH = process.env.DB_PATH || './data/streaming.db';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://catalog-service:3002';

// ── Banco de dados (Lógica Original) ───────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS streams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    movie_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ── Mensageria (Produtor RabbitMQ) ──────────────────────────
let amqpChannel;
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    amqpChannel = await connection.createChannel();
    await amqpChannel.assertQueue('movie_viewed', { durable: true });
    app.log.info('Conectado ao RabbitMQ (Streaming Producer)');
  } catch (err) {
    app.log.error('Erro ao conectar no RabbitMQ, tentando novamente em 5s...');
    setTimeout(connectRabbitMQ, 5000);
  }
}

// ── Rotas ───────────────────────────────────────────────────

// POST /streaming/play — Inicia um filme
app.post('/streaming/play', async (request, reply) => {
  const { movieId } = request.body;
  const userId = request.headers['x-user-id'] || 'anonymous';

  if (!movieId) {
    return reply.code(400).send({ error: 'movieId é obrigatório.' });
  }

  try {
    // 1. Verifica licença no Catalog Service
    const licenseRes = await fetch(`${CATALOG_SERVICE_URL}/catalog/${movieId}/license`);
    if (!licenseRes.ok) {
      return reply.code(404).send({ error: 'Filme não encontrado no catálogo.' });
    }
    
    const licenseData = await licenseRes.json();
    if (!licenseData.licensed) {
      return reply.code(403).send({ error: 'Este conteúdo não possui licença ativa para exibição.' });
    }

    // 2. Registra o início do stream no DB local
    const insert = db.prepare('INSERT INTO streams (user_id, movie_id) VALUES (?, ?)');
    insert.run(userId, movieId);

    // 3. Dispara evento para o RabbitMQ (para Recommendation e Billing)
    if (amqpChannel) {
      const event = { userId, movieId, timestamp: new Date().toISOString() };
      amqpChannel.sendToQueue('movie_viewed', Buffer.from(JSON.stringify(event)), { persistent: true });
      app.log.info(`Evento movie_viewed enviado para o filme ${movieId}`);
    }

    return {
      status: 'playing',
      movie: licenseData.title,
      message: 'Stream iniciado com sucesso.'
    };

  } catch (err) {
    app.log.error(err);
    return reply.code(500).send({ error: 'Erro interno ao processar streaming.' });
  }
});

// GET /health
app.get('/health', async () => ({
  status: 'ok',
  service: 'streaming-service',
  rabbitmq_connected: !!amqpChannel,
  timestamp: new Date().toISOString()
}));

// ── Inicialização ───────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`streaming-service rodando na porta ${PORT}`);
    
    // Inicia o produtor RabbitMQ
    await connectRabbitMQ();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Shutdown gracioso
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('SDK de Tracing do Streaming finalizado'))
    .finally(() => process.exit(0));
});

start();