/**
 * StreamFlow — API Gateway (Instrumentado)
 *
 * Ponto de entrada único para todos os microsserviços.
 * Implementa:
 * - OpenTelemetry (Tracing Distribuído - Novo Padrão)
 * - Fastify Metrics (Métricas para Prometheus)
 * - Roteamento via Proxy
 * - Autenticação JWT RS256
 */

// 1. INSTRUMENTAÇÃO OPENTELEMETRY (Iniciando no topo com o novo padrão)
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  serviceName: 'api-gateway',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

const Fastify = require('fastify');
const proxy = require('@fastify/http-proxy');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const metricsPlugin = require('fastify-metrics'); // Plugin de métricas

const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss' }
    }
  }
});

// Registro de métricas para o Prometheus
app.register(metricsPlugin, { endpoint: '/metrics' });

const PORT = process.env.PORT || 8080;

// Carregamento da Chave Pública para Verificação JWT
let PUBLIC_KEY;
try {
  PUBLIC_KEY = fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem', 'utf8');
} catch (err) {
  app.log.warn('Chave pública JWT não encontrada. Autenticação externa falhará.');
}

/**
 * Middleware de Autenticação
 */
async function authenticateJWT(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Token não fornecido ou formato inválido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
    // Injeta dados do usuário nos headers para os serviços downstream
    request.headers['x-user-id'] = decoded.sub;
    request.headers['x-user-role'] = decoded.role;
    request.headers['x-user-name'] = decoded.name;
  } catch (err) {
    return reply.code(401).send({ error: 'Token inválido ou expirado.' });
  }
}

// ── Roteamento via Proxy (MANTIDO CONFORME ORIGINAL) ───────────────────────

// Auth Service (Público)
app.register(proxy, {
  upstream: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  prefix: '/auth',
  rewritePrefix: '',
});

// Catalog Service (Protegido)
app.register(proxy, {
  upstream: process.env.CATALOG_SERVICE_URL || 'http://localhost:3002',
  prefix: '/api/catalog',
  rewritePrefix: '/catalog',
  preHandler: authenticateJWT
});

// Streaming Service (Protegido)
app.register(proxy, {
  upstream: process.env.STREAMING_SERVICE_URL || 'http://localhost:3003',
  prefix: '/api/streaming',
  rewritePrefix: '/streaming',
  preHandler: authenticateJWT
});

// Recommendation Service (Protegido)
app.register(proxy, {
  upstream: process.env.RECOMMENDATION_SERVICE_URL || 'http://localhost:3004',
  prefix: '/api/recommendations',
  rewritePrefix: '/recommendations',
  preHandler: authenticateJWT
});

// Billing & Analytics Service (Protegido)
app.register(proxy, {
  upstream: process.env.BILLING_SERVICE_URL || 'http://localhost:3006',
  prefix: '/api/billing',
  rewritePrefix: '/billing',
  preHandler: authenticateJWT
});

app.register(proxy, {
  upstream: process.env.BILLING_SERVICE_URL || 'http://localhost:3006',
  prefix: '/api/analytics',
  rewritePrefix: '/analytics',
  preHandler: authenticateJWT
});

// ── Health Check Agregado ────────────────────────────────────────────────

app.get('/health', async (request, reply) => {
  const services = {
    'auth-service': process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    'catalog-service': process.env.CATALOG_SERVICE_URL || 'http://localhost:3002',
    'streaming-service': process.env.STREAMING_SERVICE_URL || 'http://localhost:3003',
    'recommendation-service': process.env.RECOMMENDATION_SERVICE_URL || 'http://localhost:3004',
    'billing-analytics-service': process.env.BILLING_SERVICE_URL || 'http://localhost:3006',
  };

  const results = {};

  for (const [name, url] of Object.entries(services)) {
    try {
      const response = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      const data = await response.json();
      results[name] = { status: 'up', ...data };
    } catch {
      results[name] = { status: 'down' };
    }
  }

  const allUp = Object.values(results).every(r => r.status === 'up');

  return reply.code(allUp ? 200 : 503).send({
    service: 'gateway',
    status: allUp ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    downstream: results,
  });
});

// ── Inicialização ───────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`Gateway operando na porta ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Shutdown gracioso
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => app.log.info('SDK de Tracing finalizado'))
    .finally(() => process.exit(0));
});

start();