# Fix — Resiliência da feature de Templates WhatsApp/Meta

**Data:** 2026-07-02
**Branch:** `fix/whatsapp-template-resiliencia` (fork da `develop`)
**Contexto:** QA em prod encontrou 3 gaps de resiliência na feature de Templates
(FIX-199..205): submeter à Meta deu 502 pendurado (~30s), sincronizar deu 500
mudo, e o toast de erro mostrava "HTTP 502" genérico.

## O que foi corrigido

### 1. Timeout nos fetches à Graph API (`src/lib/whatsapp/api.ts`)
`createTemplate()` e `listTemplates()` faziam `fetch` à Meta **sem timeout** —
egress lento pendurava a request ~30s e o gateway devolvia 502. Adicionado
`signal: AbortSignal.timeout(15_000)` (15s) nos dois. O abort é capturado e
convertido num erro claro: `"timeout ao falar com a Meta (>15s) ao criar/listar..."`,
em vez de pendurar ou vazar `DOMException` cru.
Aplicado também (bônus trivial) em `callApi()` (envio de mensagem) e nos 2 fetch
do `downloadMedia()`. Helper `isTimeoutError()` cobre `TimeoutError`/`AbortError`.

### 2. Rota /sync resiliente (`src/app/api/admin/whatsapp/templates/sync/route.ts`)
`reconcileTemplateStatuses()` era chamada **sem try/catch** → falha (WABA_ID
ausente, Meta 4xx/5xx, timeout) virava **500 body-vazio**. Envolvida em
try/catch; em erro responde `502 { error, message }` — mesmo formato do
`[id]/submit/route.ts`. Log de servidor incluso.

### 3. Toast amigável (`src/components/admin/whatsapp-templates/`)
O toast do submit fazia `body.message ?? body.error ?? \`HTTP ${status}\``; com
502 do Cloudflare (body `text/html`) caía em `"HTTP 502"` genérico. Extraído
`error-copy.ts` → `errorMessageFromResponse(res)` (helper puro reutilizável):
- JSON de erro nosso com `message` → usa a `message` específica (útil, ex: erro
  da Meta repassado no 502 do submit);
- 5xx de gateway (502/503 HTML do Cloudflare, 500 mudo) → cópia PT-BR:
  **"Serviço temporariamente indisponível ao falar com a Meta. Tente novamente
  em instantes."**;
- senão `body.error`; fallback → cópia amigável.
`template-row-actions.tsx` passou a usar o helper. Disponível para reuso no
Sincronizar/form dialog.

## Testes (TDD strict — cada teste visto falhar antes do fix)

| Camada | Arquivo | Cobertura |
|---|---|---|
| 1 (structural) | `src/lib/whatsapp/api.timeout.test.ts` | fetch recebe AbortSignal; abort → rejeita com "timeout ao falar com a Meta" (create + list) |
| 1/2 | `src/app/api/admin/whatsapp/templates/sync/route.test.ts` | sucesso → 200; reconcile lança → 502 JSON com message (não 500) |
| 1 (structural) | `src/components/admin/whatsapp-templates/error-copy.test.ts` | message específica × gateway HTML × 5xx × body vazio |
| 1 (guard) | `templates-guard.test.ts` (atualizado) | seam resolvido: rota importa template-sync real + try/catch → 502 |

- **Meus 3 itens: 21 testes verdes.**
- **`pnpm test:unit` completo: 2526 passando**, rodado em container transitório
  (host sem `node_modules` por design — store pnpm compartilhado + Postgres
  transitório com `db:push`).
- Reduzi as falhas do gate de 4 → 2 ao corrigir o guard obsoleto.

## Gaps honestos

- **2 falhas pré-existentes** no `test:unit`, alheias a esta correção e não
  tocadas por ela (confirmado: falhavam idênticas com minhas mudanças
  stashadas):
  - `src/lib/web/lead-history-completeness.test.ts`
  - `src/lib/whatsapp/lead-history-completeness.test.ts`
  Ambas existem na `origin/develop` — dívida da develop, fora do escopo deste fix.
- O tratamento amigável foi ligado ao **botão Submeter** (row-actions). O botão
  Sincronizar / form dialog pode reusar `errorMessageFromResponse` (helper já
  exportado) — não foi ligado aqui por não estar no caminho reportado pelo QA.
- Timeout fixo em 15s (constante `GRAPH_TIMEOUT_MS`); não é configurável por env.
