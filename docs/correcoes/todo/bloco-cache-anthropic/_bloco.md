---
bloco: bloco-cache-anthropic
branch: fix/cache-anthropic-ttl-1h
workspace: fix-cache-anthropic-ttl-1h
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-213, FIX-214]
escopo_arquivos:
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/agents/builder.test.ts
  - src/lib/agent/mesa-copilot/index.ts
---
# Bloco cache-anthropic — TTL 5min→1h no prompt caching

Pacote coeso de UMA otimização (mesmo tema: TTL do cache Anthropic) em 2 pontos adjacentes
do caminho de prompt-building. Ordem interna: FIX-213 primeiro (é onde mora a verificação de
passthrough do `ttl` no AI SDK + LiteLLM — o FIX-214 herda o achado). FIX-214 depois (1-liner).

**Root cause único** (provado no código, não especulado): o cache do system prompt usa
`ephemeral` sem `ttl` = TTL de 5 min; conversa human-paced (WhatsApp/chat) tem gaps > 5 min
entre turnos → o prefixo de ~33k tokens expira e cada turno paga cache_creation (1,25×) em
vez de cache_read (0,1×). Dado real do LiteLLM prod: cache_creation de 3,34M tokens ≈ $12,5
de $21 do spend Sonnet. Fix = `ttl: "1h"`.

**Verificação obrigatória** (FIX-213): o `@ai-sdk/anthropic` ^3.0.69 e o gateway LiteLLM
repassam o campo `ttl`? O `cache_control` passa (12M cache_read comprovam), o `ttl`
especificamente não foi verificado. Provar antes de dar por feito; se não passar, resolver na
fonte (config do gateway) — nunca deixar `ttl` setado-mas-ignorado passar por verde.

Sem decisão de design real (root cause + correção fechados) → executor pula brainstorming e vai
direto pro TDD.
