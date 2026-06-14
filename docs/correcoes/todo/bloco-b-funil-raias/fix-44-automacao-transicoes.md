---
id: FIX-44
titulo: "Automação das transições faltantes (proposta/fechado) + bloqueio de regressão"
status: todo
bloco: bloco-b-funil-raias
arquivos:
  - src/lib/admin/lead-stage-tracker.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/whatsapp/proxy.ts
  - src/lib/bevi/proposal-repo.ts
  - src/lib/bevi/fulfillment.ts
  - src/app/api/admin/leads/[id]/stage/route.ts
rodada: 2026-06-14 — anotação Funil + Cliente unificado + Retorno web (Kairo, voz)
---

# FIX-44 — Automação das transições faltantes

## Palavras do operador

> *"fazer com que ele funcione (que a cada parte da jornada ele seja movido
> automaticamente)."*

## Cenário / problema

O funil é **híbrido**: automático até `qualificado` e `em_negociacao` (handoff),
mas **`proposta_enviada` e `fechado_ganho` são 100% manuais** — o admin tem que
arrastar o card. A jornada pede movimento automático "a cada parte". E o
drag-and-drop ainda **permite regredir** sem aviso.

## Root cause investigado (provado no código)

- `runner.ts:39-41` — `LEAD_STAGE_BY_TOOL` mapeia só `simulate_quota`→engajado,
  `recommend_groups`→qualificado. Nada pra proposta/fechado.
- `whatsapp/proxy.ts` (~310) — handoff sobe pra `em_negociacao` (`onlyAdvance`).
- `proposal-repo.ts:36-102` — `createBeviProposal`/`updateBeviProposal` mexem em
  `proposalStatus` (`simulacao`→`documentos`) mas **não tocam a raia do lead**.
- `fulfillment.ts:132-177` — `confirmOffer` finaliza oferta, **não move o lead**.
- `api/admin/leads/[id]/stage/route.ts` — PATCH não usa `onlyAdvance`; admin
  regride em silêncio (`kanban-board.tsx:60-96`).

## Correção proposta

| O quê | Onde |
|---|---|
| Ao criar proposta Bevi → mover lead/contato pra `proposta_enviada` (system, onlyAdvance) | `proposal-repo.ts` → `transitionLeadStage` |
| `confirmOffer`/avanço de `proposalStatus` p/ documentos/assinado → `fechado_ganho` | `fulfillment.ts` |
| "Em negociação" também por card de decisão aberto / `simulate_quota` repetida pós-recomendação (não só handoff) | `runner.ts` / tracker |
| `Perdido` por inatividade > N dias (N aprovado pelo Kairo; sugestão 14) — job/checagem | `lead-stage-tracker.ts` |
| Rota de stage: regressão exige flag explícita; default forward-only; registra em `lead_events` | `api/admin/leads/[id]/stage/route.ts` |

## Regressão exigida (CLAUDE.md) — 3 camadas (toca comportamento do agente)

- **Camada 1 (structural):** mapa de gatilhos → raia (proposta→proposta_enviada,
  confirm→fechado_ganho); rota de stage rejeita regressão sem flag.
- **Camada 2 (cassette, OBRIGATÓRIA):** em `tests/regression/agent-trajectory.test.ts`,
  cassette determinístico onde o agente chama `simulate_quota`/`recommend_groups`
  e (via fulfillment) cria proposta → asserta a raia resultante. Bug-alvo:
  "tool dispara, raia não move". Ver falhar antes.
- **Camada 3 (eval, nightly):** cenário canônico web→proposta no
  `tests/eval/agent-flow.eval.test.ts` checando a raia final no DB.
- **Integration:** criar proposta real (adapter mock Bevi) → lead em
  `proposta_enviada`; confirm → `fechado_ganho`.
