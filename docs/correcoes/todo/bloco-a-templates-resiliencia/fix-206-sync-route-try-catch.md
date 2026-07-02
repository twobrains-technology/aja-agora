---
id: FIX-206
titulo: "Rota sync de templates devolve 500 mudo — envolver em try/catch com erro acionável"
status: todo
bloco: bloco-a-templates-resiliencia
arquivos:
  - src/app/api/admin/whatsapp/templates/sync/route.ts
rodada: 2026-07-02 — QA dono-de-produto em PROD (templates WhatsApp Meta)
---

## Palavras do operador
"os gaps de código (try/catch no sync, timeout no fetch, toast) são melhorias secundárias" — Kairo, ao definir a onda pós-QA.

## Cenário exato
Admin clica "Sincronizar status" em `/admin/whatsapp/templates`. `POST /api/admin/whatsapp/templates/sync` retornou **500 com body vazio** (`content-type: null`, ~61ms) em PROD. Nenhuma mensagem no admin.

## Root cause investigado
`sync/route.ts` chama `reconcileTemplateStatuses()` **sem try/catch**. `reconcileTemplateStatuses` → `listTemplates()` (1ª linha) → `getWabaConfig()` **lança** se `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_WABA_ID` faltarem/invalidos → Next devolve 500 mudo. Comparar com `[id]/submit/route.ts`, que tem try/catch e devolve `{ error, message }` em 502.

## Correção proposta
| O quê | Onde |
|---|---|
| Envolver a chamada de reconcile em try/catch; em erro, `Response.json({ error, message }, { status: 502 })` | `src/app/api/admin/whatsapp/templates/sync/route.ts` |
| Manter o guard `requireRole("admin")` no topo (inalterado) | idem |

## Regressão exigida
Camada 1 (structural / integração de rota, `pnpm test:unit`): teste que mocka `reconcileTemplateStatuses` lançando `Error("...must be set")` e espera **status 502** com body JSON contendo `message`. Ver falhar antes do fix. Não é bug de comportamento de agent → sem cassette (Camada 2 dispensada).
