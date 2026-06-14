---
id: FIX-44
titulo: "Automação das raias de fechamento (proposta automática + polling da mesa) + forward-only"
status: todo
bloco: bloco-b-funil-raias
arquivos:
  - src/lib/admin/lead-stage-tracker.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/whatsapp/proxy.ts
  - src/lib/bevi/proposal-repo.ts
  - src/lib/bevi/proposal-status.ts
  - src/app/api/admin/leads/[id]/stage/route.ts
rodada: 2026-06-14 — anotação Funil + Cliente unificado + Retorno web (Kairo, voz)
---

# FIX-44 — Automação das raias de fechamento

## Palavras do operador

> *"fazer com que ele funcione (que a cada parte da jornada ele seja movido
> automaticamente)."*
>
> Correção do fluxo (2026-06-14): *"a proposta bevi é automática hoje, ela é
> gerada para bevi e tenho até um pdf da bevi. O que acontece manual é a mesa —
> alguém vai lá na operadora, faz tudo que precisa ser feito e depois volta com o
> contrato e boleto, atualiza no sistema da Conexia, que é o sistema que a bevi
> usa e que nós integramos."*

## Cenário / problema (entendimento corrigido)

A **proposta Bevi já é gerada automaticamente** (com PDF) — mas a **raia do funil
não acompanha** esse evento. O passo realmente **manual é a MESA**: back office
humano na operadora que efetiva o contrato e volta com **contrato + boleto**,
atualizando na **Conexia**. O sistema **não é notificado** pela mesa — o avanço
só aparece se a gente **consultar o status** (polling). Hoje esse polling
(`check_proposal_status`, FIX-14) só roda **sob demanda no chat** e **não move a
raia**. Resultado: o funil não reflete o fechamento sozinho.

## Root cause investigado (provado no código + POC)

- `proposal-repo.ts:36-102` — `createBeviProposal`/`updateBeviProposal` gravam
  `proposalStatus` (`simulacao`→`documentos`) mas **não tocam a raia do lead**.
- `proposal-status.ts` (FIX-14) — `check_proposal_status`/`getStatus` consultam a
  administradora AO VIVO, com `changesHistory` + `approvedAt`/`reprovedAt`, mas só
  são chamados quando o **usuário pergunta** no chat; **nenhum call site atualiza
  a raia** nem roda agendado.
- `runner.ts:39-41` — `LEAD_STAGE_BY_TOOL` só cobre `simulate_quota`/
  `recommend_groups`. Nada pra proposta/mesa/fechamento.
- `api/admin/leads/[id]/stage/route.ts` — PATCH não usa `onlyAdvance`; admin
  regride em silêncio (`kanban-board.tsx:60-96`).
- **POC 2026-06-05** (`jornada-ate-boleto.md` §4): **sem webhook** — acompanhamento
  é polling do `changesHistory`. Estados **pós-`waitingForUniqueCode`
  (contrato/boleto/pago) ainda NÃO observados**; `approvedAt`/`integrationCode`
  ficam `null` até a administradora/mesa processar. Proposta abandonada fica
  `pending` eterno (API não expira).

## Correção proposta

| O quê | Onde |
|---|---|
| `createBeviProposal` → mover lead/contato pra `proposta_enviada` (system, onlyAdvance) — amarra a raia ao evento que **já existe** | `proposal-repo.ts` → `transitionLeadStage` |
| **Job de polling agendado** de `getStatus` por proposta pendente: mapeia o estado → raia (`waitingForUniqueCode`/inserção → "na administradora"; estado pós-inserção → "contratado/boleto"; `reprovedAt` → perdido) e dispara mensagem proativa no canal | `proposal-status.ts` + scheduler |
| Mapear estados **pós-`waitingForUniqueCode`** (contrato/boleto/pago) → raias 7-8 **quando observados** (gap aberto — `TODO` com cross-ref `jornada-ate-boleto.md` G1/G2) | `proposal-status.ts` |
| `fechado_ganho` = **1º boleto pago** (regra de comissão — confirmar com Bevi/AGX, G3) | (pendente de sinal) |
| "Em negociação" também por card de decisão aberto / `simulate_quota` repetida pós-recomendação (não só handoff) | `runner.ts` / tracker |
| `Perdido` por inatividade > N dias (timeout **nosso** — a API não sinaliza abandono) | `lead-stage-tracker.ts` |
| Rota de stage: regressão exige flag explícita; default forward-only; registra em `lead_events` | `api/admin/leads/[id]/stage/route.ts` |

> **Dependências externas (não bloqueiam o que já dá):** as raias 7-8
> (contratado/boleto/pago) dependem de observar os estados pós-inserção e de
> confirmar a regra de comissão com a Bevi/AGX. O que **já dá pra automatizar
> agora**: `proposta_enviada` (evento interno pronto) + o polling que reflete os
> estados **já conhecidos** (até `waitingForUniqueCode`) + forward-only.

## Regressão exigida (CLAUDE.md) — 3 camadas (toca comportamento do agente)

- **Camada 1 (structural):** `createBeviProposal` dispara `proposta_enviada`;
  mapa estado-de-status → raia; rota rejeita regressão sem flag.
- **Camada 2 (cassette, OBRIGATÓRIA):** em `tests/regression/agent-trajectory.test.ts`,
  cassette onde o fluxo cria proposta → asserta raia `proposta_enviada`. Bug-alvo:
  "proposta nasce, raia não move". Ver falhar antes.
- **Camada 3 (eval, nightly):** cenário web→proposta checando a raia no DB.
- **Integration (DB real, mock do gateway):** criar proposta → `proposta_enviada`;
  simular `getStatus` avançando (fixture do `changesHistory`) → raia acompanha;
  `reprovedAt` → `perdido`.
