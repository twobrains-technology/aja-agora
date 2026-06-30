# ⚠️ PENDENTE-KAIRO — Letta memory archival falha com 401 (Anthropic key inválida)

**Achado:** qa-noturno 2026-06-24, smoke ao vivo da jornada (develop).
**Severidade:** média — best-effort (NÃO derruba a app; turno `finishReason:ok`), mas a memória archival NÃO está sendo persistida.

## Evidência (log do servidor)

```
{"source":"memory","letta_op":"store_memories","letta_agent_id":"agent-729a...",
 "error":"insertArchival simulation: MemoryError: Letta POST /v1/agents/.../archival-memory failed:
  HTTP 401 {"error":{"type":"llm_authentication","message":"Authentication failed with the LLM model provider.",
  "detail":"...Authentication failed with Anthropic: Error code: 401 - 'message': 'invalid x-api-key'"}}"}
```

## O que é

O **Letta shared** (memory layer, `~/.tb-local/_shared/`) usa uma API key da Anthropic pra
processar memória, e essa key está **inválida/expirada** (`invalid x-api-key`). Cada
`store_memories` da jornada falha com 401 → memória archival (fatos/simulações) não persiste.

## Por que NÃO corrigi (PENDENTE-KAIRO)

É **secret/config do Letta shared** (compartilhado entre TODOS os projetos TwoBrains —
fpma, sparkflow, letdrill, aja-agora). Rotacionar/corrigir a key do Letta é **blast radius
alto** (afeta outros projetos) e mexe em secret — decisão/ação do Kairo, não autônoma.

## Como destrava

Conferir/atualizar a `ANTHROPIC_API_KEY` (ou a config de provider LLM) do container
`tb-letta-shared` em `~/.tb-local/_shared/` (provável `.env.shared` ou compose do Letta).
Validar com um `store_memories` de teste. A app NÃO depende disso pra funcionar (telemetria
best-effort), então não é urgente — mas a memória de longo prazo do agente está cega até lá.
