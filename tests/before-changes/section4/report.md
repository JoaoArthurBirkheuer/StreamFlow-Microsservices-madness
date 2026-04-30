# Seção 4 — Consistência Eventual

## Diagnóstico Principal

O sistema apresenta falhas de **integridade referencial** entre os domínios de Conteúdo (Catalog) e Personalização (Recommendation).

Foi identificada a presença de **dados inconsistentes entre serviços**, onde registros removidos do catálogo continuam sendo utilizados pelo serviço de recomendações devido à ausência de mecanismos de sincronização.

---

## 1. Desatualização entre Serviços

### Problema

- O recommendation-service mantém dados locais (histórico e sugestões)
- Não há sincronização com o estado atual do catalog-service
- Alterações no catálogo não são propagadas

### Evidência

- Após a exclusão do filme com `id=1` no banco do catálogo:
  - O recommendation-service continuou retornando o item
  - Resposta HTTP permaneceu `200 OK`
- Evidências registradas:
  - *Imagem 3:* `filme_persiste_em_recomendacoes.png`
  - *Imagem 4:* `delecao_filme_banco.png`

### Impacto

- Serviços operam com visões divergentes do mesmo dado
- Violação de integridade entre domínios
- Inconsistência persistente sem mecanismo de correção automática

---

## 2. Impacto na Experiência do Usuário (UX)

### Problema

- O sistema recomenda conteúdos indisponíveis

### Evidência

- Ao tentar reproduzir um item inexistente:
  - O streaming-service retorna `404 Not Found`
- Evidências registradas:
  - *Imagem 2:* `erro_404_filme_nao_encontrado.png`
  - *Imagem 1:* `logs_recommendation_streaming.png`

### Impacto

- Experiência inconsistente para o usuário
- Perda de confiança na plataforma
- Consumo desnecessário de recursos com requisições inválidas

---

## 3. Definição de Níveis de Consistência

### Consistência Forte (Obrigatória)

Aplicável a domínios críticos:

- Billing (faturamento)
- Licenciamento (Streaming / Catalog)

**Requisito:**
- Dados devem estar sempre atualizados e consistentes
- Não é aceitável defasagem entre serviços

---

### Consistência Eventual (Controlada)

Aplicável ao Recommendation Service:

**Requisito:**

- Sincronização pode ser assíncrona
- Não deve gerar inconsistências visíveis ao usuário

---

## 4. Ação Recomendada

### Arquitetura Orientada a Eventos

- O catalog-service deve emitir eventos de domínio:
  - Exemplo: `MovieDeleted`

### Sincronização entre Serviços

- O recommendation-service deve consumir esses eventos
- Remover automaticamente referências inválidas do banco local (`recommendation.db`)

### Benefício Esperado

- Redução de inconsistências entre serviços
- Alinhamento entre domínios de dados
- Eliminação de recomendações inválidas

---

## 5. Resumo das Evidências

- O recommendation-service retorna itens inexistentes no catálogo (*Imagem 3*)
- O item foi removido diretamente no banco do catalog-service (*Imagem 4*)
- O usuário recebe erro ao tentar reproduzir o conteúdo (*Imagem 2*)

**Conclusão:**

O sistema não possui mecanismos de sincronização entre serviços, resultando em inconsistência de dados e exposição de conteúdos inválidos ao usuário.