---
id: FIX-235
titulo: "Fecho pro WhatsApp: pedir o 'oi' (abre janela 24h) + especialista de cadastros"
status: done
bloco: bloco-jornada-conversa
arquivos:
  - src/lib/bevi/closing-presentation.ts
  - src/lib/bevi/fecho-pedir-oi.ts
  - src/app/api/chat/route.ts
  - src/lib/whatsapp/interactive-handlers.ts
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR9/D8)
commit: 715d483
executado_em: "2026-07-09"
nota: >
  Escopo de arquivos DIVERGIU do declarado (system-prompt.ts/directives.ts/
  proxy.ts) — decisão registrada em
  docs/decisoes/blocos/2026-07-09-jornada-conversa.md: a copy do fecho é
  DETERMINÍSTICA (closing-presentation.ts, docx passo 5.2), não gerada pela
  LLM; o disparo do template+mesa espelha contract-summary.ts (novo módulo
  fecho-pedir-oi.ts), não o handoff-antigo de proxy.ts.
---

## Palavras do operador (handoff)
> "Ao aceitar, o agente NÃO diz 'reservado'. Diz que enviou mensagem no WhatsApp, pede um
> 'oi' e avisa que a especialista em cadastros chama em alguns minutos pra pedir dados e
> documentos. O 'oi' do cliente é o que abre a janela de 24h — a copy tem função técnica.
> Se ele não responder, o envio cai na fila de template." — `docs/00` D8, `docs/04` FECHO

## Root cause / estado atual (provado no código)
`suggest_handoff` → `handoffToAgents` (proxy) e `createMesaHandoff` (mesa) já existem;
WhatsApp Cloud API ativa; janela de 24h tratada em `whatsapp/window.ts`; fila de template
em `whatsapp_outbound_queue`. Falta a COPY do fecho (sem "reservado") + a orquestração que
pede o "oi" e encaminha pra "especialista de cadastros".

## Correção proposta
| O quê | Onde |
|---|---|
| Copy do fecho (`docs/04`): "mandei uma mensagem no seu WhatsApp / me responde com um 'oi' / em alguns minutos a especialista em cadastros te chama" — SEM "reservado/garantido" | `system-prompt.ts` `<handoff>` + directive |
| Ao aceitar o handoff: disparar mensagem no WhatsApp + pedir o "oi" | orquestração do handoff (`proxy.ts`/directive) |
| Encaminhar pra "especialista de cadastros" — decidir mesa (`createMesaHandoff`) vs proxy (`handoffToAgents`); default = mesa de cadastros | `proxy.ts` / handoff |
| Caso "cliente não responde o oi" → cair na fila de template (`whatsapp_outbound_queue`) — não assumir que o oi sempre vem | tratamento existente |

## Decisão de produto pendente (não bloqueia — usar default)
Qual mecanismo é a "especialista de cadastros": mesa (`createMesaHandoff`) ou proxy
(`handoffToAgents`)? Default: **mesa** (é a fila de atendimento humano de cadastro/documentos,
ver docs/integracoes + memória "QA Mesa de operação"). Se houver dúvida real, `AskUserQuestion`.

## Regressão exigida
- o fecho NUNCA emite "reservado/garantido/você já está no grupo" (cobre pelo sanitizer FIX-234 + teste).
- ao aceitar, o fluxo dispara o envio WhatsApp e pede o "oi".
- cliente sem "oi" → mensagem vai pra fila de template (não quebra).
- português correto na copy.
