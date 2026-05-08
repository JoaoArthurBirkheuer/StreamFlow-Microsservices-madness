/**
 * StreamFlow — Catalog Service
 * Gerencia o catálogo de filmes e séries com banco de dados próprio (catalog.db).
 */

// 1. INSTRUMENTAÇÃO OPENTELEMETRY (Novo Padrão)
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  serviceName: 'catalog-service',
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

const PORT = process.env.PORT || 3002;
const DB_PATH = process.env.DB_PATH || './data/catalog.db';

// ── Banco de dados (Lógica Original Restaurada) ────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    genre TEXT NOT NULL,
    year INTEGER,
    rating REAL DEFAULT 0,
    license_active INTEGER DEFAULT 1,
    synopsis TEXT
  )
`);

// Seed de dados originais
const count = db.prepare('SELECT COUNT(*) as total FROM movies').get();
if (count.total === 0) {
  const insert = db.prepare(
    'INSERT INTO movies (title, genre, year, rating, license_active, synopsis) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const movies = [
    ['O Poderoso Chefão', 'Drama', 1972, 9.2, 1, 'A saga da família Corleone no submundo do crime organizado.'],
    ['Interestelar', 'Ficção Científica', 2014, 8.7, 1, 'Astronautas viajam por um buraco de minhoca em busca de um novo lar.'],
    ['Parasita', 'Thriller', 2019, 8.5, 1, 'Duas famílias de classes sociais opostas se cruzam de forma inesperada.'],
    ['Matrix', 'Ação', 1999, 8.7, 1, 'Um hacker descobre que a realidade é uma simulação computacional.'],
    ['Breaking Bad', 'Drama', 2008, 9.5, 1, 'Um professor de química se torna produtor de metanfetamina.'],
    ['Stranger Things', 'Ficção Científica', 2016, 8.7, 1, 'Crianças enfrentam fenômenos sobrenaturais em uma pequena cidade.'],
    ['Dark', 'Mistério', 2017, 8.8, 1, 'Quatro famílias interligadas desvendam uma conspiração temporal.'],
    ['La Casa de Papel', 'Ação', 2017, 8.2, 0, 'Um grupo de assaltantes executa um plano no Banco da Espanha.'],
    ['O Gambito da Rainha', 'Drama', 2020, 8.6, 1, 'Uma órfã prodígio ascende no mundo do xadrez competitivo.'],
    ['Oppenheimer', 'Biografia', 2023, 8.3, 1, 'A história do físico que liderou o Projeto Manhattan.'],
  ];

  for (const m of movies) {
    insert.run(...m);
  }
  console.log('Seed: 10 filmes/séries inseridos');
}

// ── Rotas ───────────────────────────────────────────────────

// GET /catalog — listar todo o catálogo com filtros
app.get('/catalog', async (request) => {
  const { genre, year } = request.query;
  let query = 'SELECT * FROM movies WHERE 1=1';
  const params = [];

  if (genre) { query += ' AND genre = ?'; params.push(genre); }
  if (year) { query += ' AND year = ?'; params.push(Number(year)); }

  return db.prepare(query).all(...params);
});

// GET /catalog/:id — detalhes de um título
app.get('/catalog/:id', async (request, reply) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(request.params.id);
  if (!movie) {
    return reply.code(404).send({ error: 'Título não encontrado.' });
  }
  return movie;
});

// GET /catalog/:id/license — verificar licença (usado pelo streaming-service)
app.get('/catalog/:id/license', async (request, reply) => {
  const movie = db.prepare('SELECT id, title, license_active FROM movies WHERE id = ?').get(request.params.id);
  if (!movie) {
    return reply.code(404).send({ error: 'Título não encontrado.' });
  }
  return { id: movie.id, title: movie.title, licensed: movie.license_active === 1 };
});

// GET /health
app.get('/health', async () => ({
  status: 'ok',
  service: 'catalog-service',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
  observability: 'instrumented'
}));

// ── Inicialização ───────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`catalog-service rodando na porta ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Shutdown gracioso
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('SDK de Tracing do Catalog finalizado'))
    .finally(() => process.exit(0));
});

start();