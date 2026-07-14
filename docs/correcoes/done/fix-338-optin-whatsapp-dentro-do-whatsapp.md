---
id: FIX-338
titulo: "P0 — o agente pede o WhatsApp do cliente DENTRO do WhatsApp"
status: done
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/agent/orchestrator/whatsapp-optin-guard.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
  - src/lib/agent/orchestrator/runner.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
executado_em: 2026-07-14
---

# FIX-338 — pedido de WhatsApp dentro do próprio WhatsApp

## Cenário (3 das 4 jornadas que fecham, whatsapp)
O agente pede o número de WhatsApp do cliente… no canal WhatsApp. Absurdo de contexto — o
número JÁ é conhecido (é o `waId`).

## Root cause
`shouldEmitWhatsappOptin` (`whatsapp-optin-guard.ts:22-35`) **não checa o `channel`**.

## Correção proposta
| O quê | Onde |
|---|---|
| O opt-in de WhatsApp só existe no canal `web`. No canal `whatsapp` ele nunca dispara | `whatsapp-optin-guard.ts` (guard por canal) |

## Regressão exigida
- Unit: `shouldEmitWhatsappOptin({channel:"whatsapp", ...})` → sempre false.

## Execução (2026-07-14)

`ConversationMetadata` não tem campo `channel` — `shouldEmitWhatsappOptin(meta, channel)` virou
um 2º parâmetro (`channel: Channel`, tipo já existente em `orchestrator/types.ts`), com a
checagem `if (channel === "whatsapp") return false;` como PRIMEIRO guard, antes de qualquer
outra condição. Dois call sites reais (não só o de `whatsapp-optin-guard.ts` citado no card):

1. `orchestrator/index.ts:977` — emissão SERVER-SIDE (o path de produção real do bug, dispara
   incondicionalmente no fecho). `channel` já estava em escopo na função.
2. `artifact-guard.ts` (regra `whatsapp-optin`, 2ª linha de defesa pro caso do MODELO chamar a
   tool diretamente) — `ArtifactGuardInput` ganhou o campo `channel`, propagado do ÚNICO call
   site real (`runner.ts:646`, que já tinha `channel` em escopo).

Testes existentes de `artifact-guard.test.ts`/`artifact-guard.fix53.test.ts` precisaram de
`channel: "web"` no `makeInput()` default (assinatura ficou obrigatória — fail-closed, sem
default silencioso pra "web" que mascararia um call site esquecido). Teste novo cobre: canal
whatsapp nunca emite mesmo com todas as outras condições satisfeitas; mesmo meta, só o canal
muda o resultado. TDD confirmado via `git stash` dos 4 arquivos de produção (RED nos 4 testes
que provam o gap de canal, GREEN após o fix). Suíte de integração
`index.fix-280-whatsapp-optin-server-side` + `index.fix-303-whatsapp-optin-fecho` (canal web)
sem regressão.
