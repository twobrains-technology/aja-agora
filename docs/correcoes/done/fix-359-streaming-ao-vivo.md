---
id: FIX-359
titulo: "Streaming de token ao vivo no runtime LangGraph (invoke → stream)"
status: done
bloco: bloco-funil-completo-langgraph
arquivos:
  - src/lib/agent/langgraph/run-turn.ts
  - src/lib/agent/langgraph/nodes/converse.ts
rodada: 2026-07-20 — campanha runtime LangGraph, Rodada 1
executado_em: 2026-07-20
---

## Palavras do operador
"que a gente simplesmente troque de um para o outro" — a experiência tem que ser equivalente, e o
chat atual entrega texto em streaming token-a-token.

## Cenário
Com `AI_RUNTIME=langgraph`, o texto do agente deve chegar ao usuário token-a-token (como o Vercel),
não o turno inteiro de uma vez.

## Root cause (investigado — TODO(rodada-1) declarado pela fundação)
- A fundação usa `graph.invoke()` (`run-turn.ts`) e drena eventos do ESTADO FINAL — sem streaming ao
  vivo. Decisão documentada no `.done` da Rodada 0: havia risco de ordem entre o evento `gate` (que faz
  `reloadMeta` fresco no `web/adapter.ts:308`) e o nó `persist`.
- O `converse` já emite `text-delta`/`tool-call` via `config.writer` (infra pronta), mas nada é drenado
  ao vivo porque o runtime usa `invoke`.

## Correção proposta
| O quê | Onde |
|---|---|
| Trocar `graph.invoke(...)` por `graph.stream(input, { streamMode: ["custom","values"] })`; drenar `custom` (text-delta/tool-call/artifact via `config.writer`) AO VIVO e `values` (estado final: gate/meta-update/lead-stage/finish) no fim | `run-turn.ts` |
| Garantir a ORDEM: eventos que dependem de `reloadMeta` fresco (`gate`) só saem DEPOIS do nó `persist` — emitir `gate`/`meta-update` a partir do `values` final (pós-persist), nunca do `custom` no meio | `run-turn.ts` |
| `converse` emite `text-delta` por chunk do `model.stream()` via `config.writer` (já existe — confirmar que sai ao vivo) | `converse.ts` |

## Critério de aceitação
- Teste de integração: um turno LangGraph emite múltiplos `text-delta` ANTES do `finish` (streaming real).
- O card de `gate` só é emitido após a persistência (ordem garantida) — sem dado stale.
- `AI_RUNTIME=vercel` intacto; `pnpm test:unit` verde.

## Regressão exigida
Teste que asserta ≥2 `text-delta` antes do `finish` no runtime langgraph (invariante de streaming). Modelo mockado streaming.
