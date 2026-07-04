---
id: FIX-214
titulo: "Cache Anthropic do mesa-copilot: TTL 5min→1h (mesmo padrão human-paced)"
status: done
bloco: bloco-cache-anthropic
arquivos:
  - src/lib/agent/mesa-copilot/index.ts
  - src/lib/agent/mesa-copilot/system-prompt.test.ts
rodada: 2026-07-04 — investigação de custo LiteLLM (mudança de preço WhatsApp Meta)
commit: d9f50c23
executado_em: 2026-07-04
---

## 6. Execução

1-liner aplicado (`ttl: "1h"` em `mesa-copilot/index.ts:71`), teste estrutural
existente (`FIX-67 builder — cache do manual`) estendido pra assertar `ttl: "1h"`.
Herda o mesmo veredito de passthrough do FIX-213 — AI SDK provado, gateway LiteLLM
em aberto (ver detalhe lá).

## 1. Palavras do operador

> "lança por favor um conjunto de atividades para resolvermos o cache anthropic aqui"

## 2. Cenário exato

O copilot do atendente (mesa de operação) monta o manual como bloco cacheável e chama o
Claude via gateway. O atendente lê a sugestão, atende o cliente, e volta a pedir ajuda ao
copilot **minutos depois** — mesma cadência humana que derruba o cache de 5 min do agente
principal (ver FIX-213). Cada retorno após gap > 5 min re-escreve o manual cacheável a 1,25×.

## 3. Root cause INVESTIGADO (provado no código)

- `src/lib/agent/mesa-copilot/index.ts:47` anexa `cacheControl: { type: "ephemeral" }` no
  bloco STABLE (o manual), preservando o cache — **mas sem `ttl`, é TTL de 5 min** (default).
- `mesa-copilot/system-prompt.ts:14` confirma: o manual é o "bloco CACHEÁVEL (index.ts aplica
  cacheControl ephemeral)". Mesmo padrão e mesmo defeito do agente principal.

## 4. Correção proposta

| O quê | Onde |
|---|---|
| Trocar `{ type: "ephemeral" }` por `{ type: "ephemeral", ttl: "1h" }` | `mesa-copilot/index.ts:47` |

Depende do mesmo achado de passthrough do FIX-213 (AI SDK + LiteLLM repassam `ttl`?). Se o
FIX-213 provar que passa, este é 1-liner. Se não passar, herda a mesma resolução na fonte.

## 5. Regressão exigida

- Se `mesa-copilot` já tem teste estrutural do bloco cacheável, estender pra assertar
  `ttl: "1h"`. Se não houver teste barato de montar (o copilot depende de contexto de mesa),
  cobrir com a mesma assertion estrutural mínima do FIX-213 aplicada ao ponto do `index.ts`.
  Não inventar E2E de mesa só pra isso — assertion estrutural do `cacheControl` basta.
