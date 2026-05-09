# Seção 6 — O Caso Prime Video

## Diagnóstico Principal

A arquitetura do StreamFlow apresenta **fragmentação sem alinhamento com os domínios de negócio**.

Os serviços de Billing e Analytics compartilham a mesma base de dados (`shared_billing.db`), eliminando na prática qualquer isolamento entre eles.

---

## 1. Oportunidade de Consolidação: Analytics & Billing

### Problema

- O analytics-service acessa diretamente tabelas do domínio de faturamento
- Não existe comunicação via API entre os serviços
- O acoplamento ocorre no nível do banco de dados

### Evidência

- Consultas diretas do Analytics em tabelas como `invoices` (Imagem 2)
- O Analytics continua funcional mesmo com o Billing indisponível (Imagem 1)
- Dependência real está no banco, não no serviço

### Impacto

- Quebra do princípio de isolamento de microsserviços
- Separação artificial sem ganho de resiliência
- Custo adicional de infraestrutura e comunicação entre containers

---

## 2. Benchmark: Prime Video

### Referência

- Consolidação de componentes para redução de custo e latência
- Redução de overhead operacional em pipelines internos

### Aplicação ao cenário

- Manter Analytics como serviço isolado não gera benefício proporcional
- A estrutura atual aumenta custo operacional sem ganho técnico relevante

---

## 3. Recomendação de Rumo

### Proposta

- Incorporar o Analytics como módulo interno do Billing Service

### Impacto Direto

- Redução de custos de infraestrutura
- Simplificação do pipeline de deploy
- Eliminação de comunicação em rede entre serviços
- Redução de pontos de falha operacionais

### Resultado Esperado

- Arquitetura mais alinhada aos domínios de negócio
- Menor complexidade operacional
- Melhor utilização da capacidade da equipe