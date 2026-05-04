/**
 * StreamFlow — Analytics Pipeline Service
 *
 * ⚠️  ANTIPATTERN DUPLO:
 *
 *     1. BANCO COMPARTILHADO: Lê diretamente as tabelas do billing-service
 *        (subscriptions, invoices) no mesmo shared_billing.db, sem usar
 *        a API do billing-service. Isso cria acoplamento direto e impede
 *        o deploy independente de ambos os serviços.
 *
 *     2. PIPELINE SEQUENCIAL (caso Prime Video): O endpoint /analytics/report
 *        executa todas as etapas de análise em sequência dentro do mesmo
 *        processo — coleta, agregação, formatação. Não há benefício de
 *        decomposição em microsserviço, pois cada etapa depende da anterior.
 *        Este é exatamente o cenário que a equipe do Prime Video consolidou,
 *        reduzindo custos em 90%.
 */

const Fastify = require('fastify');
const Database = require('better-sqlite3');

const app = Fastify({ logger: true });

const PORT = process.env.PORT || 3007;
const DB_PATH = process.env.DB_PATH || './data/shared_billing.db';

// ── Banco de dados (COMPARTILHADO com billing!) ─────────────
// NOTA: Este serviço lê tabelas que pertencem ao billing-service.
// Em uma arquitetura correta, deveria consumir dados via API do billing.
const db = new Database(DB_PATH);

// Tabela própria do analytics (apenas esta deveria existir aqui)
db.exec(`
  CREATE TABLE IF NOT EXISTS report_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_type TEXT NOT NULL,
    generated_at TEXT DEFAULT (datetime('now')),
    data TEXT NOT NULL
  )
`);

// ── Rotas ───────────────────────────────────────────────────

// GET /analytics/report — gera relatório financeiro
// Pipeline sequencial: coleta → agrega → formata (caso Prime Video)
app.get('/analytics/report', async (request, reply) => {
  app.log.info('Iniciando pipeline de relatório...');

  // ── ETAPA 1: Coleta (lê DIRETAMENTE do banco do billing) ──
  app.log.info('Etapa 1/3: Coletando dados de faturamento...');
  const subscriptions = db.prepare('SELECT * FROM subscriptions').all();
  const invoices = db.prepare('SELECT * FROM invoices').all();

  // Simula latência de processamento
  await new Promise(resolve => setTimeout(resolve, 150));

  // ── ETAPA 2: Agregação (depende da etapa 1) ──
  app.log.info('Etapa 2/3: Agregando métricas...');

  const totalRevenue = subscriptions
    .filter(s => s.status === 'active')
    .reduce((sum, s) => sum + s.price_monthly, 0);

  const paidInvoices = invoices.filter(i => i.paid === 1);
  const pendingInvoices = invoices.filter(i => i.paid === 0);

  const planDistribution = {};
  for (const sub of subscriptions) {
    planDistribution[sub.plan] = (planDistribution[sub.plan] || 0) + 1;
  }

  await new Promise(resolve => setTimeout(resolve, 100));

  // ── ETAPA 3: Formatação (depende da etapa 2) ──
  app.log.info('Etapa 3/3: Formatando relatório...');

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalSubscribers: subscriptions.length,
      activeSubscribers: subscriptions.filter(s => s.status === 'active').length,
      monthlyRecurringRevenue: totalRevenue.toFixed(2),
      totalInvoices: invoices.length,
      paidInvoices: paidInvoices.length,
      pendingInvoices: pendingInvoices.length,
      collectionRate: invoices.length > 0
        ? ((paidInvoices.length / invoices.length) * 100).toFixed(1) + '%'
        : '0%',
    },
    planDistribution,
    pipeline: {
      note: 'Este relatório foi gerado por um pipeline sequencial interno.',
      stages: ['coleta', 'agregação', 'formatação'],
      totalProcessingTime: '~250ms',
    },
  };

  // Cache o relatório
  db.prepare('INSERT INTO report_cache (report_type, data) VALUES (?, ?)').run(
    'financial_summary',
    JSON.stringify(report)
  );

  return report;
});

// GET /analytics/history — histórico de relatórios gerados
app.get('/analytics/history', async () => {
  return db.prepare(
    'SELECT id, report_type, generated_at FROM report_cache ORDER BY generated_at DESC LIMIT 10'
  ).all();
});

// GET /health
app.get('/health', async () => ({
  status: 'ok',
  service: 'analytics-service',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

// ── Inicialização ───────────────────────────────────────────
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  app.log.info(`analytics-service rodando na porta ${PORT}`);
});
