---
id: FIX-35
titulo: "WhatsApp 'Tenho interesse' fazia handoff pra consultor — tem que seguir o MESMO funil self-service da web (mesma jornada)"
status: done
commit: f2eb529
executado_em: 2026-06-12
bloco: bloco-s-funil-canonico (extensão — canal WhatsApp)
arquivos:
  - src/lib/whatsapp/interactive-handlers.ts (handleInterest)
  - src/lib/whatsapp/lead-history-completeness.test.ts (Camada 2 integration)
  - tests/regression/agent-trajectory.test.ts (Camada 1 + GAP #2 atualizado)
  - src/lib/eval/jornada-rubric.ts (Camada 3 — flag multicanal)
rodada: 2026-06-12 (pedido direto do Kairo após FIX-34/29/33)
anotado_em: 2026-06-12
---

# FIX-35 — WhatsApp "Tenho interesse" no MESMO funil self-service da web

## Palavras do operador

> "whatsapp precisa ser exatamente igual a web, é a mesma jornada"
> "o handoff pode ser feito em momentos de erros ou onde o cliente manifesta
>  dúvida e interesse em falar com alguém. conseguimos manter dessa forma?"

## Cenário

O FIX-34/29 corrigiu a web (clique "Tenho interesse" pós-reveal → decisão →
contratação self-service, sem consultor). O WhatsApp ficou para trás:
`interactive-handlers.ts::handleInterest` fazia `startInterestHandoff` (handoff
pra consultor humano) no clique "Tenho interesse" — o MESMO bug, no outro canal.

## Root cause

`handleInterest` (interactive-handlers.ts) chamava `startInterestHandoff` direto
no clique `interest_*`. Contradiz a jornada self-service.

## Correção

`handleInterest` passou a espelhar EXATAMENTE o handler web (route.ts):
- pós-reveal + `!decisionDispatched` → `buildDecisionPromptDirective` (card de decisão);
- decisão já apresentada → `buildAdvanceToContractDirective` (passo 5);
- mantém `recordUserClick` (persistência do clique, GAP #2 do BUG-LEAD-HISTORY-INCOMPLETE);
- se a conversa já está `handed_off` (com humano), fall-through pro relay.

## Handoff humano PRESERVADO (resposta à pergunta do Kairo)

O handoff pra consultor **continua intacto** — só deixou de ser disparado pelo
clique "Tenho interesse". Os caminhos legítimos seguem valendo:
1. **Triggers de erro/valor da persona** → o agente chama `suggest_handoff`
   (runner.ts detecta) → card "Sim, conectar".
2. **Cliente pede humano** → `present_decision_prompt` opção "Quero falar com um
   especialista" → `suggest_handoff` (system-prompt). Texto livre idem.
3. **Confirmação** → `handoff_confirm` → `handleHandoffConfirm` →
   `startInterestHandoff` (interactive-handlers.ts:216, intacto).

## Regressão (3 camadas)

- **Camada 1**: `agent-trajectory` describe `FIX-WA-INTEREST` — handleInterest NÃO
  contém `startInterestHandoff`, contém `buildDecisionPromptDirective`/
  `buildAdvanceToContractDirective`, mantém `recordUserClick`; handleHandoffConfirm
  PRESERVA `startInterestHandoff`. GAP #2 do BUG-LEAD-HISTORY-INCOMPLETE atualizado.
- **Camada 2**: `lead-history-completeness.test.ts` (integration DB) — clique
  "Tenho interesse" persiste artifact + user msg, marca `decisionDispatched`, e
  NENHUMA mensagem cita "consultor".
- **Camada 3**: flag `desviouPraConsultorHumano` no `jornada-rubric` (canal-agnóstica,
  agora explícita pros dois canais).
