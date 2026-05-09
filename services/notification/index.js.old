/**
 * StreamFlow — Notification Service
 *
 * ⚠️  ANTIPATTERN: Microsserviço síncrono no caminho crítico
 *     Este serviço é chamado de forma síncrona pelo streaming-service
 *     durante o fluxo de "Play". Ele simula o envio de uma notificação
 *     (push, e-mail, etc.) e bloqueia a resposta ao usuário enquanto
 *     "processa".
 *
 *     Em uma arquitetura bem projetada, notificações seriam disparadas
 *     de forma assíncrona via fila de mensagens (RabbitMQ, Redis Pub/Sub,
 *     Kafka), sem bloquear o fluxo principal.
 *
 *     Este serviço também NÃO possui banco de dados próprio — ele não
 *     persiste nada, apenas simula o envio.
 */

const Fastify = require('fastify');

const app = Fastify({ logger: true });

const PORT = process.env.PORT || 3005;

// ── Rotas ───────────────────────────────────────────────────

// POST /notify — simula envio de notificação
app.post('/notify', async (request, reply) => {
  const { userId, type, message } = request.body || {};

  if (!userId || !message) {
    return reply.code(400).send({ error: 'userId e message são obrigatórios.' });
  }

  // Simula latência de processamento de notificação (100-300ms)
  const delay = 100 + Math.floor(Math.random() * 200);
  await new Promise(resolve => setTimeout(resolve, delay));

  app.log.info({ userId, type, delay }, `Notificação enviada (simulada em ${delay}ms)`);

  return {
    sent: true,
    userId,
    type: type || 'generic',
    message,
    processingTime: `${delay}ms`,
  };
});

// GET /health
app.get('/health', async () => ({
  status: 'ok',
  service: 'notification-service',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

// ── Inicialização ───────────────────────────────────────────
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  app.log.info(`notification-service rodando na porta ${PORT}`);
});
