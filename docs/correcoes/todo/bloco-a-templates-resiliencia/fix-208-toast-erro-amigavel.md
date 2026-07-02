---
id: FIX-208
titulo: "Toast de erro do submit mostra 'HTTP 502' genérico quando a resposta não é JSON"
status: todo
bloco: bloco-a-templates-resiliencia
arquivos:
  - src/components/admin/whatsapp-templates/template-row-actions.tsx
rodada: 2026-07-02 — QA dono-de-produto em PROD (templates WhatsApp Meta)
---

## Palavras do operador
"toast de erro amigável" — Kairo, na lista dos 3 gaps de código da onda pós-QA.

## Cenário exato
Submeter à Meta falhou com 502 do Cloudflare (resposta `text/html`, não JSON). O toast no admin mostrou apenas **"Falha ao submeter: HTTP 502"** — sem indicar indisponibilidade nem o que fazer.

## Root cause investigado
`template-row-actions.tsx` → `confirmSubmit`: `const body = await res.json().catch(() => ({}))` e `throw new Error(body.message ?? body.error ?? \`HTTP ${res.status}\`)`. Com 502 do Cloudflare o body é HTML → cai no genérico "HTTP 502". Não distingue erro de gateway/não-JSON de um erro de negócio da app.

## Correção proposta
| O quê | Onde |
|---|---|
| Ao falhar, checar `content-type`/status: se não-JSON ou 5xx de gateway, usar cópia amigável ("Serviço temporariamente indisponível ao falar com a Meta. Tente novamente em instantes.") | `confirmSubmit` em `template-row-actions.tsx` |
| Preservar a mensagem da app quando ela vier em JSON (`body.message`/`body.error`) | idem |

## Regressão exigida
Camada 1 (component/unit, `pnpm test:unit`): mock de `fetch` retornando 502 com body HTML (`content-type: text/html`) → esperar a mensagem amigável no estado de erro (não "HTTP 502"); e mock retornando 502 JSON com `message` → esperar a mensagem da app. Ver falhar antes do fix. Sem cassette (não-agent).

## Nota
Item de UX puro (React, sem AI) — Camada 1 cobre (conforme CLAUDE.md, "typo/UI sem lógica de agent" não exige cassette).
