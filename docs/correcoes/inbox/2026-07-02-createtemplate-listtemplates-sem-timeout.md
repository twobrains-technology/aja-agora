# Bug — `createTemplate`/`listTemplates` fazem fetch à Meta sem timeout (pendura → 502 gateway)

- **Data:** 2026-07-02 (QA dono-de-produto em PROD)
- **Origem:** FIX-200 (cliente Meta). Card mãe: `2026-07-02-whatsapp-template-submit-sync-quebrados-prod.md`.
- **Severidade:** média — resiliência; sem isso, egress lento/pendurado vira 502 do Cloudflare em vez de erro tratado e rápido.

## Cenário
Submeter um template quando o egress do VPS pra `graph.facebook.com` está lento/bloqueado: o `fetch` de `createTemplate()` fica pendurado ~30s+ até o Cloudflare cortar com **502 Bad Gateway** (observado nas 1ªs tentativas em prod — timestamps de console 144416ms e 174530ms).

## Esperado × Atual
- **Esperado:** o `fetch` à Meta tem timeout curto (ex.: 10–15s); ao estourar, `createTemplate`/`listTemplates` lançam erro claro que o try/catch da rota converte em 502 JSON acionável — sem prender o worker nem estourar o gateway.
- **Atual:** `src/lib/whatsapp/api.ts` — ambos os `fetch` (`POST /{WABA_ID}/message_templates` e `GET .../message_templates`) **sem `AbortSignal.timeout`**. Egress pendurado prende a requisição até o limite do Cloudflare.

## Evidência
- Console PROD: 2× ERROR 502 no submit com grande delta de tempo (≈30s+ por tentativa) antes do corte.
- Raw fetch do submit → 502 `text/html` (página de erro do Cloudflare), não resposta da app.

## Onde mexe (provável)
- `src/lib/whatsapp/api.ts` — `createTemplate` e `listTemplates`: adicionar `signal: AbortSignal.timeout(<ms>)` ao `fetch`; tratar `AbortError` com mensagem "timeout ao falar com a Meta".
- Considerar aplicar o mesmo em `callApi`/download de mídia (mesmo padrão de fetch sem timeout).

## Tratamento
TDD unit: mockar `fetch` que nunca resolve + fake timers → esperar rejeição por timeout dentro do orçamento. Structural na função.
