---
id: FIX-207
titulo: "createTemplate/listTemplates fazem fetch à Meta sem timeout — pendura até 502 do gateway"
status: todo
bloco: bloco-a-templates-resiliencia
arquivos:
  - src/lib/whatsapp/api.ts
rodada: 2026-07-02 — QA dono-de-produto em PROD (templates WhatsApp Meta)
---

## Palavras do operador
"timeout no fetch" — Kairo, na lista dos 3 gaps de código da onda pós-QA.

## Cenário exato
Submeter um template em PROD: nas 1ªs tentativas o `fetch` de `createTemplate()` ficou pendurado ~30s+ (timestamps de console 144416ms e 174530ms) até o Cloudflare cortar com **502 Bad Gateway** (`text/html`), em vez de erro tratado e rápido.

## Root cause investigado
`src/lib/whatsapp/api.ts` — `createTemplate` (`POST /{WABA_ID}/message_templates`) e `listTemplates` (`GET .../message_templates`) fazem `fetch` **sem `signal`/timeout**. Egress do VPS pra `graph.facebook.com` lento/bloqueado → a requisição prende o worker até o limite do gateway → 502 do Cloudflare (não a resposta da app; o try/catch da rota nem chega a tratar).

## Correção proposta
| O quê | Onde |
|---|---|
| Adicionar `signal: AbortSignal.timeout(<ms>)` (ex.: 15000) aos dois `fetch` de template | `createTemplate`, `listTemplates` em `src/lib/whatsapp/api.ts` |
| Tratar `AbortError`/timeout com mensagem clara ("timeout ao falar com a Meta (<ms>ms)") no throw, pra o try/catch da rota devolver 502 JSON acionável | idem |
| (Se trivial) considerar o mesmo em `callApi`/download de mídia — só se não alargar o escopo do bloco | idem |

## Regressão exigida
Camada 1 (unit, `pnpm test:unit`): mockar `global.fetch` que rejeita com `AbortError` (ou nunca resolve + fake timers) e esperar que `createTemplate`/`listTemplates` rejeitem com erro de timeout dentro do orçamento. Ver falhar antes do fix (hoje não há timeout). Sem cassette (não-agent).
