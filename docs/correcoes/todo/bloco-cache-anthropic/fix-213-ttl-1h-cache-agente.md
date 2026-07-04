---
id: FIX-213
titulo: "Cache Anthropic do agente: TTL 5min→1h (elimina cache-creation em conversa human-paced)"
status: todo
bloco: bloco-cache-anthropic
arquivos:
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/agents/builder.test.ts
rodada: 2026-07-04 — investigação de custo LiteLLM (mudança de preço WhatsApp Meta)
---

## 1. Palavras do operador

> "lança por favor um conjunto de atividades para resolvermos o cache anthropic aqui"

Contexto: análise da mudança de preço da Meta (out/2026, service message cobrada) mostrou
que **o custo real do stack não é a taxa da Meta (~R$ 0,25/conversa) — é o Claude
(~R$ 1,90/conversa), dominado por cache-creation**. Este card ataca o driver.

## 2. Cenário exato (dado real, medido no LiteLLM prod)

Agregado das vk `aja-agora-prod` (Sonnet-4-6 + Sonnet-5), tabela `LiteLLM_DailyTeamSpend`
do banco `litellm` em `db-twobrains-prd` (2026-07-04):

| Métrica | Valor |
|---|---|
| requests | 498 |
| input tokens | 16.632.735 (~33,4k/request) |
| **cache_read** (barato, 0,1×) | 11.989.784 (~72% do input) |
| **cache_creation** (caro, 1,25×) | 3.343.299 |
| spend Sonnet | ~$20,97 |

Custo do cache-creation ≈ 3,34M × $3,75/M (write Sonnet, TTL 5min) ≈ **$12,5 de $21** — o
maior item da conta.

## 3. Root cause INVESTIGADO (provado no código)

- `src/lib/agent/agents/builder.ts:213-232` monta `baseInstructions` com **UM** breakpoint:
  `cacheControl: { type: "ephemeral" }` no bloco `blocks.stable` (1º item do array `system`).
  `type: "ephemeral"` **sem `ttl` = TTL de 5 minutos** (default Anthropic).
- O bloco `stable` (`system-prompt.ts:992-1057`) é **byte-idêntico entre turnos da mesma
  conversa** — os voláteis (`expertise`, `whatsappOptinStage`, `contractClosedInfo`) estão
  corretamente no `dynamic` (linha 1061), DEPOIS do breakpoint, e `currentDate` é date-only
  (estável dentro do dia). Ou seja: **não há silent-invalidator; o cache deveria ser lido.**
- **O assassino é o TTL curto vs cadência humana.** Conversa de WhatsApp/chat é human-paced:
  o usuário responde depois de **minutos**. A cada gap > 5 min, o cache do prefixo de ~33k
  tokens **expira** → o turno seguinte paga **cache_creation (write, 1,25×)** em vez de
  **cache_read (0,1×)**. É exatamente o 3,34M de cache_creation observado.

Referência de mecânica: skill `claude-api` → `shared/prompt-caching.md`
("cache_control: {type: 'ephemeral', ttl: '1h'}"; write 1,25× para 5min, **2× para 1h**;
read 0,1×).

## 4. Correção proposta

| O quê | Onde |
|---|---|
| Trocar `{ type: "ephemeral" }` por `{ type: "ephemeral", ttl: "1h" }` no breakpoint do bloco `stable` (ambos os ramos do ternário `blocks.dynamic ?`) | `builder.ts:219` e `:229` |
| **VERIFICAR (não cravar) o passthrough do `ttl`**: (a) `@ai-sdk/anthropic` ^3.0.69 aceita/repassa `providerOptions.anthropic.cacheControl.ttl`? (b) o gateway LiteLLM (`litellm-srv.tb.local:4000`) repassa o campo `ttl` pro Anthropic? O `cache_control` passa (temos 12M cache_read), mas o `ttl` **especificamente** é gap de verificação. Provar antes de dar por feito. | investigação |

Trade-off (por que 1h e não 5min): write 2× **uma vez/hora** em vez de 1,25× **a cada 5 min**.
Numa conversa de 6 turnos espalhados em 20 min: 5min TTL ≈ 6 writes; 1h TTL ≈ 1 write. Ganho
grande. Break-even do 1h = 3 reads (2× + 0,2× < 3×) — sempre atingido numa conversa real.

## 5. Regressão exigida (TDD strict)

- Teste em `builder.test.ts` que asserta: o 1º bloco de `system` (o `stable`) carrega
  `providerOptions.anthropic.cacheControl` **com `ttl: "1h"`** (hoje falha — não há `ttl`),
  em ambos os ramos (com e sem `blocks.dynamic`). Blindagem estrutural: garante que o
  breakpoint não regrida pro TTL curto silenciosamente.
- Se a verificação do passthrough (item 4) revelar que o AI SDK/LiteLLM **não** repassa `ttl`,
  documentar o achado no `.done/` e no ADR, e resolver na fonte que repassa (config do gateway
  ou header) — nunca deixar o `ttl` "setado mas ignorado" passando por verde.
