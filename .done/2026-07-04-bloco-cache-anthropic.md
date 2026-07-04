---
titulo: "Bloco cache-anthropic — TTL 5min→1h no prompt caching"
data: 2026-07-04
bloco: bloco-cache-anthropic
branch: fix/cache-anthropic-ttl-1h
tipo: perf (otimização de custo) — sem mudança de comportamento visível ao usuário
---

# Bloco cache-anthropic — TTL 5min→1h no prompt caching

Pacote de UMA otimização em 2 pontos adjacentes do caminho de prompt-building: o
breakpoint de cache do system prompt do agente principal (FIX-213) e do copiloto de
mesa (FIX-214) trocam `cacheControl: { type: "ephemeral" }` (TTL default 5min) por
`{ type: "ephemeral", ttl: "1h" }`.

## TL;DR

- **Root cause** (já provado antes de eu começar, não re-investigado): conversa
  human-paced (WhatsApp/chat) tem gaps > 5min entre turnos → o prefixo cacheado
  expira e cada turno paga `cache_creation` (1,25×) em vez de `cache_read` (0,1×).
  Dado real do LiteLLM prod: 3,34M de 16,6M tokens de input eram cache_creation
  (~$12,5 de $21 do spend Sonnet).
- **FIX-213** e **FIX-214**: `ttl: "1h"` aplicado nos dois breakpoints, TDD strict
  (teste escrito primeiro, visto falhar, depois corrigido).
- **Achado extra não previsto no escopo**: o pre-commit hook (Camada 2, trajectory
  snapshots) estava bloqueando QUALQUER commit em `src/lib/agent/**` por um teste
  stale em `tests/regression/agent-trajectory.test.ts` — asserção esperava o ack
  antigo `NO_OPEN_HANDOFF_REPLY` que a feature "copiloto de mesa orienta no claim e
  consulta manual avulso" (commit `12944410`, já mergeado antes desta branch) tinha
  substituído por `handleMesaManualConsulta`. Corrigido em commit separado
  (`8a5f2ed9`), claramente rotulado, sem misturar com o trabalho de cache — bug
  técnico óbvio e de baixo blast radius (assertion de teste desatualizada, não
  ambiguidade de produto).
- **Gate**: 3 commits passaram Camada 1+2 (`test:pre-commit` — 282 arquivos/2734
  testes) + Camada 3 (LLM real cirúrgico, `EVAL-SAVE-CONTACT-NAME-CIRURGICO` +
  `EVAL-ASSISTANT-LESS-FORMAL`) verdes.

## Commits

| Commit | O quê |
|---|---|
| `8a5f2ed9` | test: corrige asserção stale do fallback sem handoff no copiloto de mesa (desbloqueio de pre-commit, fora do escopo do bloco mas erro técnico óbvio) |
| `52533f3b` | perf: cache anthropic do agente com ttl 1h (corta cache-creation em conversa human-paced) — FIX-213 |
| `d9f50c23` | perf: cache anthropic do mesa-copilot com ttl 1h — FIX-214 |
| `8b9e55d` | docs: move fix-213/214 pra done e apaga bloco cache-anthropic esvaziado |

## FIX-213 — cache do agente principal (`builder.ts:213-232`)

Teste novo em `builder.prompt-cache.test.ts` ("FIX-213: o breakpoint do bloco stable
usa ttl 1h") asserta que **ambos** os ramos do ternário (`blocks.dynamic` presente ou
não) carregam `ttl: "1h"` no `cacheControl`. Visto falhar antes da correção (regex
batia só em `{ type: "ephemeral" }` sem ttl), depois passando com a troca pra
`{ type: "ephemeral" as const, ttl: "1h" as const }`.

## FIX-214 — cache do mesa-copilot (`mesa-copilot/index.ts:71`)

1-liner: `{ type: "ephemeral" }` → `{ type: "ephemeral", ttl: "1h" }`. Teste
estrutural existente (`FIX-67 builder — cache do manual`) em
`system-prompt.test.ts` estendido com um novo `it` que asserta o `ttl: "1h"` no
mesmo bloco `cacheControl`. Visto falhar, depois passando.

## Veredito honesto do passthrough do `ttl` (item crítico pedido no prompt)

**AI SDK (`@ai-sdk/anthropic` — instalado ^3.0.78, acima do ^3.0.69 do package.json)
— PROVADO por leitura de código, não por request real:**
- O schema Zod interno (`node_modules/@ai-sdk/anthropic/dist/index.d.ts`) tipa
  `cacheControl.ttl` como `z.union([z.literal("5m"), z.literal("1h")])` — aceita e
  valida `"1h"` explicitamente, não é campo solto.
- No código de transformação (`dist/index.js`), o objeto `cacheControl` completo
  (via `getCacheControl()`) é repassado **verbatim** como `cache_control` no body da
  request pra Anthropic — não há strip de campos, o `ttl` viaja junto.
- Não fiz nenhuma chamada de rede real pra confirmar isso em runtime (o worktree não
  tem acesso a prod) — é leitura de código instalado, mas é uma leitura direta do
  pacote que efetivamente roda em produção (mesma versão do lockfile).

**Gateway LiteLLM (`litellm-srv.tb.local:4000`) — DÚVIDA ABERTA, não provada:**
- Consultei a doc oficial via context7 (`/websites/litellm_ai` + `/berriai/litellm`).
- O passthrough de `cache_control.ttl` está **documentado explicitamente só pra
  Gemini** (formato `"3600s"`, unidade e sintaxe diferentes do Anthropic).
- Para Anthropic, todos os exemplos de doc mostram só `cache_control: {type:
  "ephemeral"}`, sem nenhum exemplo com `ttl`. Não encontrei o código de
  `transform_request` do provider Anthropic no LiteLLM que comprove se o campo
  sobrevive ao proxy intacto ou é descartado.
- **Não afirmo que funciona nem que não funciona** — é uma lacuna real de
  verificação, não um "provavelmente funciona".
- **Próximo passo pra fechar** (registrado no fix-213 em `done/`): com
  `litellm.set_verbose=True` (SDK Python) ou log de request do gateway em
  homol/prod, disparar 1 chamada real ao agente e inspecionar o JSON cru enviado
  pra `api.anthropic.com/v1/messages` — confirmar se `cache_control` chega com
  `ttl: "1h"` ou só `type: "ephemeral"` (campo dropado silenciosamente). Se dropado,
  a resolução é na config do gateway (upgrade LiteLLM ou passthrough explícito),
  nunca contornar no app.

## Gaps honestos

- O ganho de custo real (menos cache_creation no LiteLLM prod) só se confirma
  **depois do merge + observação de 1-2 dias de tráfego real** comparando
  `LiteLLM_DailyTeamSpend` antes/depois — não dá pra medir num worktree isolado.
- Não criei alerta/dashboard de acompanhamento desse gasto — fora do escopo pedido.
- O achado do teste stale (`NO_OPEN_HANDOFF_REPLY`) foi corrigido mas não investiguei
  se há OUTROS testes desatualizados pela mesma feature de consulta avulsa — só
  corrigi o que bloqueava meu commit.
