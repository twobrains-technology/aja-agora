---
bloco: bloco-rev-a-agente-nucleo
branch: rev/agente-nucleo
workspace: rev-agente-nucleo
onda: 1
depends_on: []
paralelo_com: [bloco-rev-b-jornada-bevi, bloco-rev-c-mesa-kanban, bloco-rev-d-whatsapp-chat, bloco-rev-e-fundacao-ui]
itens: []   # AUDITORIA — sem FIX-NN pré-definido; o revisor DESCOBRE e corrige na hora
escopo_arquivos:
  - src/lib/agent/**
  - src/lib/llm/**
  - src/lib/conversation/**
  - src/lib/memory/**
  - tests/regression/agent-trajectory.test.ts
  - tests/eval/**
---
# Bloco REV-A — Auditoria do núcleo do agente

Revisão adversarial (Opus) do código do agente gerado por sessões Superset com modelo fraco.
Área mais crítica e maior do repo (~107 arquivos em `src/lib/agent`). Cobre o agent loop
(orchestrator/runner/tools), system-prompt, builder, classificador, LLM gateway, memória
(pós-remoção do Letta) e as 3 camadas de regressão de agent.

**Conflito esperado:** nenhum com os outros rev (áreas disjuntas). NÃO toca `src/db/schema.ts`
nem `drizzle/**` (dono = rev-e) — achado de schema vira PENDENTE-REV-E.
