---
id: FIX-347
titulo: "P1 — 'Acho que me perdi por aqui' volta em turnos com resposta CLARA do usuário (2/8)"
status: todo
bloco: bloco-f-turno-vazio-meta
arquivos:
  - src/lib/chat/empty-turn-guard.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/runner.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 4 (juiz Sonnet, 7/10)
---

# FIX-347 — o agente diz "me perdi" quando o usuário foi claríssimo

## Cenário (moto-web t9, servicos-web t10 — 2 de 8)
O usuário responde algo **claro** e o agente devolve:

> "Acho que me perdi por aqui. Pode mandar de novo, por favor?"

Regrediu: era **0/8** na rodada 3.

## Root cause (localizado pelo juiz)
`src/lib/chat/empty-turn-guard.ts:37` (`EMPTY_TURN_FALLBACK`), disparado em
`src/app/api/chat/route.ts:1568` quando o turno fecha **sem texto e sem artifact**.

**A pergunta que você tem que responder ANTES de corrigir:** *por que o turno ficou vazio?* Duas
hipóteses — PROVE qual é (rode a jornada, olhe o log e o `turn-trace`):
1. O modelo não gerou nada (raro).
2. **O sanitizer DROPOU tudo** que ele gerou (provável — a campanha adicionou vários guards novos:
   `isHallucinatedAdministradoraClaim`, `isPrematureTopOfferClaim`, meta-narrativa…). Se for isso,
   os guards estão comendo demais e o "me perdi" é só o sintoma.

## Correção proposta

| O quê | Onde |
|---|---|
| **Se o turno esvaziou por causa do sanitizer**: em vez de emitir texto fixo, dar ao modelo UMA chance de reformular no mesmo turno, com o motivo do corte no contexto ("não cite administradora fora da lista", "não anuncie os próprios passos") | `runner.ts` (retry de 1 tentativa quando `fullResponse` fica vazio pós-sanitize) |
| Só se ainda assim vier vazio, o fallback aparece — e **nunca com a mesma frase** | `empty-turn-guard.ts` |
| ⚠️ NÃO resolva relaxando um guard de INVARIANTE (alucinação/compliance). Se o guard está certo e o modelo insiste no erro, o retry com o motivo é o caminho | — |

## Regressão exigida
- Integração: turno cujo texto é integralmente dropado pelo sanitizer → o modelo é chamado de novo
  com o motivo, e o usuário recebe uma resposta REAL (não "me perdi").
- Integração: "me perdi" nunca aparece 2× na mesma conversa.
