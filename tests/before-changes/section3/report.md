# Seção 3 — Observabilidade Frágil

## Diagnóstico Principal

O sistema possui **logs estruturados por serviço**, porém não há **rastreabilidade distribuída**.

Não existe um identificador único (Correlation ID) que conecte uma requisição do Gateway até os serviços internos. Como resultado, o diagnóstico de incidentes depende de análise manual e correlação por timestamp.

---

## 1. Rastreabilidade de Requisição

### Problema

- Cada serviço gera seu próprio `reqId` de forma independente
- Não há propagação de contexto entre requisições
- O fluxo entre serviços não pode ser reconstruído de forma determinística

### Evidência

- A mesma operação de "play" aparece com identificadores diferentes:
  - Gateway: `req-2`
  - Streaming Service: `req-1`
- Não existe campo compartilhado nos logs que permita correlação direta
- Dependência de timestamp como único ponto de associação

### Impacto

- Impossibilidade de rastrear uma requisição ponta a ponta
- Dificuldade para identificar gargalos ou falhas específicas
- Baixa confiabilidade na análise em ambientes com múltiplas requisições concorrentes

---

## 2. Lacunas no Diagnóstico de Incidentes

### Problema

- Não há visibilidade clara sobre onde uma falha ocorre na cadeia de serviços
- O tempo gasto em cada etapa não é mensurado de forma integrada

### Evidência

- Em cenário de indisponibilidade do `catalog-service`:
  - Gateway retorna erro genérico `503 (Service Unavailable)`
  - Streaming Service registra erro técnico de conexão
- Não existe vínculo entre:
  - o erro apresentado ao cliente
  - a falha registrada no serviço interno

### Impacto

- Diagnóstico exige análise manual de múltiplos serviços
- Alto tempo de resolução (MTTR)
- Dificuldade para identificar causa raiz em incidentes distribuídos

---

## 3. Estratégia de Observabilidade Proposta

### Objetivo

Estabelecer rastreabilidade ponta a ponta e visibilidade operacional do sistema.

### Pilares

#### 3.1 Tracing Distribuído

- Implementar **Correlation ID global**
- Propagar o identificador entre serviços via headers
- Medir tempo de execução por serviço

**Ferramentas sugeridas:**

- OpenTelemetry  
- Jaeger  

---

#### 3.2 Logging Centralizado

- Consolidar logs de todos os serviços em um único sistema
- Permitir busca e correlação por Correlation ID

**Ferramentas sugeridas:**

- ELK Stack (Elasticsearch, Logstash, Kibana)  
- Loki  

---

#### 3.3 Métricas e Monitoramento

- Coletar métricas de latência e disponibilidade
- Monitorar saúde dos serviços em tempo real

**Ferramentas sugeridas:**

- Prometheus  
- Grafana  

---

### Benefícios Esperados

- Redução do tempo de diagnóstico de incidentes
- Identificação precisa de gargalos
- Visibilidade completa do fluxo de requisições
- Base para evolução segura da arquitetura distribuída