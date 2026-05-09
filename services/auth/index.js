/**
 * StreamFlow — Auth Service
 * * Gerencia usuários e emissão de tokens JWT RS256.
 */

// 1. INSTRUMENTAÇÃO OPENTELEMETRY (Novo Padrão)
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  serviceName: 'auth-service',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// 2. DEPENDÊNCIAS
const Fastify = require('fastify');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const metricsPlugin = require('fastify-metrics');

const app = Fastify({ 
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  } 
});

// Registro de métricas
app.register(metricsPlugin, { endpoint: '/metrics' });

const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || './data/auth.db';

// Carregamento da Chave Privada (Necessária para assinar o JWT)
const PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem';
const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');

// ── Banco de dados (Lógica Original) ───────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'user'
  )
`);

// Seed de usuário Admin (se não existir)
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@streamflow.com');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)')
    .run('1', 'admin@streamflow.com', hashedPassword, 'Administrator', 'admin');
  console.log('Seed: Usuário admin criado (admin@streamflow.com / admin123)');
}

// ── Rotas ───────────────────────────────────────────────────

// POST /login — Autentica e gera o token
app.post('/login', async (request, reply) => {
  const { email, password } = request.body;

  if (!email || !password) {
    return reply.code(400).send({ error: 'Email e senha são obrigatórios.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return reply.code(401).send({ error: 'Credenciais inválidas.' });
  }

  // Payload do Token
  const payload = {
    sub: user.id,
    name: user.name,
    role: user.role
  };

  // Assina com RS256 usando a chave privada
  const token = jwt.sign(payload, PRIVATE_KEY, { 
    algorithm: 'RS256', 
    expiresIn: '1h' 
  });

  return { 
    token,
    user: { id: user.id, name: user.name, role: user.role }
  };
});

// GET /health
app.get('/health', async () => ({
  status: 'ok',
  service: 'auth-service',
  timestamp: new Date().toISOString()
}));

// ── Inicialização ───────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`auth-service rodando na porta ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Shutdown gracioso
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('SDK de Tracing do Auth finalizado'))
    .finally(() => process.exit(0));
});

start();