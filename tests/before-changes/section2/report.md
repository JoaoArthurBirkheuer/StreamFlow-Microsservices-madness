# Seção 2 — Latência de Rede e Cadeia Síncrona

## Diagnóstico Principal

O fluxo crítico de reprodução ("play") opera em uma **cadeia síncrona obrigatória**.

O tempo de resposta ao usuário é determinado pela soma das latências dos serviços envolvidos no fluxo, e não apenas pelo streaming-service.

- **Hops:** Identificamos um total de **4 saltos síncronos**  
  *(Gateway → Streaming → Catalog / Recommendation / Notification)*

- **Latência:** A latência estimada adicionada pela cadeia é de **~300ms**, sendo que o **notification-service sozinho é responsável por até 65% desse atraso**

---

## 1. Notification Service

### Problema

- O streaming-service depende da resposta do notification-service para concluir o fluxo
- O serviço introduz latência artificial entre 100ms e 300ms por requisição

### Evidência

- Logs indicam tempo adicional consistente na etapa de notificação
- Testes com `time curl` mostram aumento relevante no tempo total do endpoint `/streaming/play`
- Comparação com chamadas diretas (ex: catálogo) evidencia o custo adicional

### Impacto

- Aumento direto no tempo de resposta percebido pelo usuário
- Penalização de um fluxo crítico por uma operação não essencial
- Responsável pela maior parcela da latência total da cadeia

---

## 2. Fragilidade e Acoplamento Temporal

### Problema

- O fluxo depende da disponibilidade e latência de serviços secundários
- Falhas em notification ou recommendation impactam diretamente o streaming

### Evidência

- Em cenário de indisponibilidade do notification-service:
  - Ocorrência de erros `ENOTFOUND` nos logs
  - Tempo de resposta observado em ~446ms (acima do baseline)
- O sistema continua tentando resolver dependências não críticas

### Impacto

- Redução da disponibilidade efetiva
- Aumento do tempo de resposta sob falhas
- Comportamento degradado em cenários parciais

---

## 3. Eficiência de Comunicação (Hops de Rede)

### Problema

- O fluxo realiza chamadas sequenciais entre múltiplos serviços
- Cada chamada adiciona overhead de rede e processamento HTTP

### Evidência

- Cadeia identificada:
  1. streaming → catalog  
  2. streaming → recommendation  
  3. streaming → notification  
- Medições mostram diferença significativa entre:
  - chamada simples (catálogo)
  - execução completa do fluxo de play

### Impacto

- Aumento do tempo total por requisição
- Maior consumo de recursos (serialização/deserialização)
- Sensibilidade a variações de latência entre serviços

---

## 4. Diretriz de Arquitetura

### Recomendação

- Apenas a validação de licença (Catalog) deve ocorrer de forma síncrona
- Recomendações e notificações devem ser desacopladas do fluxo principal

### Ação Proposta

- Introduzir processamento assíncrono via fila de mensagens
- Remover dependências não críticas do caminho de resposta ao usuário

### Benefício Esperado

- Redução significativa da latência do fluxo de play
- Maior resiliência a falhas parciais
- Melhor isolamento entre responsabilidades