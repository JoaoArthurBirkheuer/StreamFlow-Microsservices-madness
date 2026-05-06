/**
 * StreamFlow — Streaming Service (Otimizado)
 * 
 * ARQUITETURA REFORMULADA:
 * 1. Fim da Cadeia Síncrona: O fluxo de 'Play' agora aguarda apenas o necessário (Catálogo).
 * 2. Background Processing: Recomendações e Notificações não bloqueiam mais a resposta.
 * 3. Consolidação Funcional: Lógica de notificação internalizada para reduzir hops de rede.
 */

const Fastify = require('fastify');
const Database = require('better-sqlite3');

const app = Fastify({ 
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  } 
});

const PORT = process.env.PORT || 3003;
const DB_PATH = process.env.DB_PATH || './data/streaming.db';

// URLs dos serviços (Nota: NOTIFICATION_URL removida pois o serviço foi consolidado)
const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3002';
const RECOMMENDATION_URL = process.env.RECOMMENDATION_SERVICE_URL || 'http://localhost:3004';

// ── Banco de dados ──────────────────────────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    movie_id INTEGER NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    duration_seconds INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
  )
`);

// ── FUNÇÃO INTERNA: Simulação de Notificação (Background) ────
// Resolve a Seção 2 do report: remove latência síncrona de 100-300ms.
async function sendNotificationAsync(userId, title) {
  const delay = 100 + Math.floor(Math.random() * 200);
  
  // Simula o disparo assíncrono (ex: mandando para uma fila ou worker)
  setTimeout(() => {
    app.log.info({ userId, delay }, `[NOTIFY-ASYNC] Notificação enviada para usuário: ${title}`);
  }, delay);
}

// ── Rotas ───────────────────────────────────────────────────

// POST /streaming/play — iniciar reprodução
app.post('/streaming/play', async (request, reply) => {
  const { movieId } = request.body || {};
  const userId = request.headers['x-user-id'] || 'anonymous';

  if (!movieId) {
    return reply.code(400).send({ error: 'movieId é obrigatório.' });
  }

  app.log.info({ movieId, userId }, 'Solicitação de Play recebida');

  // ── ETAPA 1 (CRÍTICA): Verificar licença no catalog-service ──
  // Mantemos o 'await' aqui pois não podemos permitir o play sem licença.
  let licenseData;
  try {
    const licenseRes = await fetch(`${CATALOG_URL}/catalog/${movieId}/license`, {
      signal: AbortSignal.timeout(3000),
    });
    
    if (!licenseRes.ok) {
      return reply.code(404).send({ error: 'Título não encontrado no catálogo.' });
    }
    
    licenseData = await licenseRes.json();

    if (!licenseData.licensed) {
      return reply.code(403).send({ error: 'Licença expirada para este título.' });
    }
  } catch (err) {
    app.log.error({ err }, 'Falha ao verificar licença (Catalog indisponível)');
    return reply.code(503).send({ error: 'Falha na verificação de catálogo.' });
  }

  // ── ETAPA 2 (BACKGROUND): Registrar visualização no recommendation-service ──
  // REMOVEMOS o 'await'. O serviço de streaming não para se a recomendação estiver lenta.
  fetch(`${RECOMMENDATION_URL}/recommendations/viewed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, movieId }),
    signal: AbortSignal.timeout(2000),
  }).catch(err => {
    app.log.warn({ err }, 'Falha silenciosa em Recommendation Service (background)');
  });

  // ── ETAPA 3 (INTERNALIZADA): Notificar início de sessão ──
  // Sem chamada de rede externa (fetch), eliminando o container de notificação.
  sendNotificationAsync(userId, licenseData.title);

  // ── ETAPA 4: Persistir sessão e responder ──
  const info = db.prepare(
    'INSERT INTO sessions (user_id, movie_id) VALUES (?, ?)'
  ).run(userId, movieId);

  app.log.info({ sessionId: info.lastInsertRowid }, 'Sessão iniciada com sucesso');

  return reply.code(201).send({
    sessionId: info.lastInsertRowid,
    movie: licenseData.title,
    status: 'playing',
    message: 'Reprodução iniciada com latência otimizada.',
  });
});

// GET /streaming/sessions — listar sessões
app.get('/streaming/sessions', async (request) => {
  const userId = request.headers['x-user-id'] || 'anonymous';
  return db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC').all(userId);
});

// GET /health
app.get('/health', async () => ({
  status: 'ok',
  service: 'streaming-service',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
  optimization: 'async-notification-applied'
}));

// ── Inicialização ───────────────────────────────────────────
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Streaming Service operando na porta ${PORT}`);
});