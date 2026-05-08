/**
 * StreamFlow — Recommendation Service
 * Gera recomendações baseadas no histórico de visualização.
 * Consome mensagens do RabbitMQ enviadas pelo Streaming Service.
 */

// 1. INSTRUMENTAÇÃO OPENTELEMETRY (Novo Padrão)
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  serviceName: 'recommendation-service',
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

const PORT = process.env.PORT || 3004;
const DB_PATH = process.env.DB_PATH || './data/recommendation.db';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';

// ── Banco de dados (Lógica Original) ───────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS view_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    movie_id INTEGER NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ── Mensageria (Consumidor RabbitMQ) ────────────────────────
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    const queue = 'movie_viewed';
    await channel.assertQueue(queue, { durable: true });
    
    app.log.info(`Aguardando mensagens na fila: ${queue}`);

    channel.consume(queue, (msg) => {
      if (msg !== null) {
        const content = JSON.parse(msg.content.toString());
        app.log.info({ msg: 'Evento recebido', content });

        // Salva no histórico para futuras recomendações
        const insert = db.prepare('INSERT INTO view_history (user_id, movie_id) VALUES (?, ?)');
        insert.run(content.userId, content.movieId);

        channel.ack(msg);
      }
    });
  } catch (err) {
    app.log.error('Erro ao conectar no RabbitMQ, tentando novamente em 5s...');
    setTimeout(connectRabbitMQ, 5000);
  }
}

// ── Rotas ───────────────────────────────────────────────────

// GET /recommendations — Sugere títulos baseados no histórico
app.get('/recommendations', async (request) => {
  const userId = request.headers['x-user-id'];
  
  if (!userId) {
    // Se não logado, retorna os mais vistos globalmente
    return db.prepare(`
      SELECT movie_id, COUNT(*) as views 
      FROM view_history 
      GROUP BY movie_id 
      ORDER BY views DESC LIMIT 5
    `).all();
  }

  return db.prepare('SELECT * FROM view_history WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 10').all(userId);
});

// GET /health
app.get('/health', async () => ({
  status: 'ok',
  service: 'recommendation-service',
  timestamp: new Date().toISOString()
}));

// ── Inicialização ───────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`recommendation-service rodando na porta ${PORT}`);
    
    // Inicia o consumidor RabbitMQ
    await connectRabbitMQ();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Shutdown gracioso
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('SDK de Tracing do Recommendation finalizado'))
    .finally(() => process.exit(0));
});

start();