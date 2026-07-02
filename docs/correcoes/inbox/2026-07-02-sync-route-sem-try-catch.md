# Bug — Rota `sync` de templates devolve 500 mudo (sem try/catch)

- **Data:** 2026-07-02 (QA dono-de-produto em PROD)
- **Origem:** FIX-202 (poll de reconciliação de status). Card mãe do bloqueador: `2026-07-02-whatsapp-template-submit-sync-quebrados-prod.md`.
- **Severidade:** média — não é o bloqueador do fluxo (esse é config de env), mas mascara a causa e piora o diagnóstico.

## Cenário
Admin clica "Sincronizar status" em `/admin/whatsapp/templates`. `POST /api/admin/whatsapp/templates/sync` → **500 com body vazio** (`content-type: null`, ~61ms). Nenhuma mensagem no admin.

## Esperado × Atual
- **Esperado:** falha na reconciliação (ex.: WABA_ID ausente, Meta 4xx, egress) devolve **JSON `{ error, message }`** e o admin mostra um toast acionável — mesmo padrão do submit route.
- **Atual:** `sync/route.ts` chama `reconcileTemplateStatuses()` **sem try/catch**. `reconcileTemplateStatuses` → `listTemplates()` → `getWabaConfig()` lança se env faltar → 500 mudo do Next.

## Evidência
- Raw fetch em prod: `POST .../sync` → status 500, `content-type: null`, body vazio, 61ms.

## Onde mexe (provável)
- `src/app/api/admin/whatsapp/templates/sync/route.ts` — envolver em try/catch; em erro, `Response.json({ error, message }, { status: 502 })`.
- (Opcional) alinhar o formato de erro com `[id]/submit/route.ts`.

## Tratamento
TDD: teste de integração da rota (mock de `reconcileTemplateStatuses` lançando) esperando 502 JSON com `message` — ver falhar → fix → verde. Camada 1 (structural) da rota.
