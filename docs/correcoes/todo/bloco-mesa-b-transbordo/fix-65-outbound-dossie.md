---
id: FIX-65
titulo: "Outbound: dossiê + orientação pro WhatsApp do atendente"
status: todo
bloco: bloco-mesa-b-transbordo
arquivos:
  - src/lib/whatsapp/mesa/outbound.ts
  - src/lib/mesa/handoff.ts
rodada: 2026-06-21 feature mesa de operação (Kairo, autônomo)
---
# FIX-65 — Outbound do dossiê

**Spec:** `docs/visao/mesa-de-operacao.md` §4-5 + §8 (PII).

## O quê × onde
- `src/lib/whatsapp/mesa/outbound.ts`: `sendCaseToAttendant(handoff)` monta o dossiê (nome do
  cliente, contato, cota: grupo/carta/parcela/administradora, link da proposta) e envia ao
  `whatsapp` do atendente via `sendTextMessage` (`src/lib/whatsapp/api.ts`).
- **Minimização de PII**: só o necessário pra contratar; NÃO injetar CPF cru.
- Disparado pela API de transbordo (FIX-64).

## Regressão
- Integration: outbound chama `sendTextMessage` com o número do atendente (mock a fronteira Meta).
- Camada 1: o dossiê montado NÃO contém CPF cru (assert sobre a string).

## Nota
O gancho do copiloto (1ª msg em `mesa_copilot_messages`) é do bloco C. Aqui deixe `TODO(bloco-c):`.
