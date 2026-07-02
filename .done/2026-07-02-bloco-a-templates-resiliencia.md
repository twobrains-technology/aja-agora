# Bloco A — Resiliência dos templates de WhatsApp (Meta)

**Branch:** `fix/whatsapp-templates-resiliencia` · **Executado:** 2026-07-02 · **Onda:** 1

Três correções de resiliência/UX da feature de Message Templates (Meta), achadas no QA
de PROD de 2026-07-02. Arquivos disjuntos (nível 1). **Sem fase de design** — root cause
e correção já vinham fechados nos cards; TDD strict direto (teste → falha → fix → verde),
1 commit `test+fix:` por item.

## O que entregou

| Fix | Problema (PROD) | Correção | Commit |
|-----|-----------------|----------|--------|
| FIX-206 | `POST /sync` devolvia **500 mudo** quando `reconcileTemplateStatuses` lançava (config/Meta) | try/catch → **502 JSON** `{ error, message }` acionável | `70ca35c1` |
| FIX-207 | `createTemplate`/`listTemplates` faziam `fetch` à Meta **sem timeout** → worker pendurava ~30s até 502 do Cloudflare | `AbortSignal.timeout(15s)` + tradução de `AbortError` em erro de timeout claro | `f15d143a` |
| FIX-208 | Toast do submit mostrava **"HTTP 502"** cru quando a resposta era html (Cloudflare) | helper `deriveSubmitErrorMessage`: 5xx/gateway → cópia amigável; JSON de negócio → preserva `message`/`error` | `6d124b8c` |

Extra (mesmo tema, mesma rota do FIX-206):
- `a815adfd` — atualiza `templates-guard.test.ts`: o guard cravava o **STUB pré-merge** do
  seam nível-3 (função local + `TODO(bloco-backend)`), que já não existe (a rota importa a
  impl real de `template-sync`). Guard estava vermelho na develop; reescrito pro estado
  pós-merge + assert do try/catch do FIX-206.

## Testes (Camada 1 — `pnpm test:unit`)

- `src/app/api/admin/whatsapp/templates/sync/sync-resilience.fix-206.test.ts` — 2 testes (502 em erro / 200 no sucesso).
- `src/lib/whatsapp/api.templates-timeout.fix-207.test.ts` — 4 testes (signal presente + rejeição por timeout).
- `src/components/admin/whatsapp-templates/submit-error-copy.fix-208.test.ts` — 5 testes (gateway/JSON/fallback).
- `src/app/api/admin/whatsapp/templates/templates-guard.test.ts` — 9 testes (guard pós-merge + try/catch).

Todos os novos **verdes**. Sem cassette (Camada 2 dispensada — nenhum é comportamento de
agent/LLM, conforme os cards e o CLAUDE.md). Gate validado em container transitório
(`aja-agora-develop-app` + store pnpm compartilhado; host sem `node_modules` por regra).

## Gaps / notas honestas

- **`pnpm test:unit` tem 5 falhas pré-existentes** em 3 arquivos de agent/orchestrator/whatsapp
  (`lead-history-completeness`, `ai-sdk.test`, `agent-trajectory`, `lead-collection`,
  `ai-sdk.contact` etc.) — todas por `connect ECONNREFUSED …:5432` (dependem de Postgres
  seedado). **Nenhuma toca arquivo deste bloco**; idênticas com ou sem as mudanças. É a
  mesma dívida de infra/DB da develop (par da dívida de typecheck já documentada). Fora do
  escopo do bloco.
- **Bloqueador real do fluxo é config de PROD** (`WHATSAPP_WABA_ID`/token/escopo + migration
  0032), PENDENTE-KAIRO — fora do escopo de código. Estes 3 fixes são resiliência/UX; não
  ativam o fluxo sozinhos.

## Linha vermelha

Branch empurrada. **Não** houve PR/merge/deploy/restart. Integração na base é do
orquestrador (merge-wave).
