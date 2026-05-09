/**
 * StreamFlow — Billing & Analytics Service
 * Gerencia o faturamento e a análise de dados.
 */

// 1. INSTRUMENTAÇÃO OPENTELEMETRY (Novo Padrão)
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  serviceName: 'billing-analytics-service',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// 2. DEPENDÊNCIAS
const Fastify = require('fastify');
const Database = require('better-sqlite3');
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

const PORT = process.env.PORT || 3006;
const DB_PATH = process.env.DB_PATH || './data/shared_billing.db';

// ── Banco de dados (Lógica Original) ───────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS billing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    user_id TEXT,
    metadata TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Rotas ───────────────────────────────────────────────────

// GET /billing/history — Lista faturamentos
app.get('/billing/history', async (request) => {
  const userId = request.headers['x-user-id'];
  if (userId) {
    return db.prepare('SELECT * FROM billing WHERE user_id = ?').all(userId);
  }
  return db.prepare('SELECT * FROM billing').all();
});

// GET /analytics/report — Relatório de uso
app.get('/analytics/report', async () => {
  const stats = db.prepare('SELECT event_type, COUNT(*) as count FROM analytics_events GROUP BY event_type').all();
  return {
    report: 'Relatório de Atividade',
    data: stats,
    generated_at: new Date().toISOString()
  };
});

// GET /health
app.get('/health', async () => ({
  status: 'ok',
  service: 'billing-analytics-service',
  timestamp: new Date().toISOString()
}));

// ── Inicialização ───────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`billing-analytics-service rodando na porta ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Shutdown gracioso
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('SDK de Tracing do Billing finalizado'))
    .finally(() => process.exit(0));
});

start();