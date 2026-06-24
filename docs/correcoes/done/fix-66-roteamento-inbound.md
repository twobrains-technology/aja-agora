---
id: FIX-66
titulo: "Roteamento inbound por número de atendente de mesa + persistência"
status: done
bloco: bloco-mesa-c-copiloto
commit: d038cbf4
executado_em: 2026-06-21
arquivos:
  - src/lib/whatsapp/processor.ts
  - src/lib/whatsapp/mesa/routing.ts
rodada: 2026-06-21 feature mesa de operação (Kairo, autônomo)
---
# FIX-66 — Roteamento inbound do copiloto

**Spec:** `docs/visao/mesa-de-operacao.md` §5 + §8 (sem colisão de canal).

## O quê × onde
- `src/lib/whatsapp/mesa/routing.ts`: `isMesaAttendantPhone(phone)` (consulta `mesa_attendants`
  ativos, cache curto como `getAttendantList`) + `handleMesaCopilot(from, text)` (resolve
  `mesa_handoffs` aberto → persiste msg do atendente → chama copiloto → persiste resposta → envia).
- `processor.ts`: early-return ANÁLOGO ao `isAttendantPhone` (linha 58), no topo de
  `processTextMessage`. ÚNICA edição nesse arquivo.

## Regressão
- Camada 1: `isMesaAttendantPhone` consulta a tabela; hook presente no processor.
- Integration: msg de número de atendente de mesa com handoff aberto → persiste em
  `mesa_copilot_messages`; nunca cai em vendas.
