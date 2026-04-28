# Seção 1 — Custo Operacional Oculto

## Diagnóstico Principal

Atualmente, o sistema opera com **8 serviços independentes** para uma equipe de **15 pessoas**.  
A análise da estrutura indica uma **distribuição artificial**: há complexidade de microsserviços sem ganho proporcional em isolamento, escalabilidade ou autonomia.

---

## 1. Oportunidade de Consolidação: Billing & Analytics

### O Problema

- Billing e Analytics utilizam o mesmo banco físico (`shared_billing.db`)
- O Analytics executa consultas diretas e processamento sequencial sobre dados do Billing

### Impacto

- Não existe independência real entre os serviços
- Alterações no schema do Billing impactam diretamente o Analytics
- Dois serviços consomem recursos para operar sobre o mesmo conjunto de dados
- Comunicação em rede desnecessária entre containers

### Ação

- Consolidar o Analytics dentro do Billing
- Eliminar comunicação inter-serviço nesse fluxo
- Reduzir custo de infraestrutura e complexidade operacional

---

## 2. Ineficiência de Infraestrutura: Notification Service

### O Problema

- Serviço stateless (sem banco de dados)
- Não mantém estado nem regras de negócio relevantes
- Atua apenas como intermediário para envio de notificações
- Introduz latência adicional (100–300ms)

### Impacto

- Uso de container dedicado sem justificativa técnica
- Aumento desnecessário no tempo de resposta do sistema
- Complexidade adicional de deploy e monitoramento

### Ação

- Substituir por biblioteca interna ou componente assíncrono
- Remover dependência síncrona no fluxo principal

---

## 3. Overhead de Manutenção (Equipe de 15 pessoas)

### Manutenção Redundante

- Múltiplos serviços com estrutura e dependências semelhantes
- Esforço duplicado para tarefas operacionais básicas

### Impacto

- Tempo de manutenção significativamente maior do que o necessário
- Atualizações de segurança e dependências exigem múltiplos ciclos de build e deploy
- Redução da capacidade da equipe de focar em evolução do produto

### Risco Operacional

- Necessidade de coordenação entre múltiplos deploys
- Maior probabilidade de inconsistências entre serviços
- Aumento do risco de falhas humanas em processos repetitivos

---

## Resumo

A Evidência 1 mostra que estamos mantendo 8 containers ativos que consomem recursos desnecessariamente para uma equipe pequena, enquanto as Evidências 2 e 3 flagram o Analytics funcionando perfeitamente mesmo com o serviço de Billing desligado. Isso confirma que o Analytics "fura" a barreira do microsserviço para ler o banco de dados diretamente, provando que temos o custo de manter vários serviços sem o benefício real da independência entre eles.