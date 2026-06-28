# Bug (OPERACIONAL/INFRA — não é bug de código do app) — Memória archival do Letta morrendo silenciosamente: timeout de 8s mascarando OpenAI 429 (quota de embeddings esgotada)

- **Natureza:** **OPERACIONAL / INFRA**, NÃO defeito de código do app. A causa-raiz e a correção vivem **fora do repo do app** (billing/config do `tb-letta-shared`). O código do app está se comportando como projetado (best-effort). Registrado aqui só pra não perder o achado e dar visibilidade.
- **Data:** 2026-06-25 (teste manual do Kairo via monitor de logs — chat web, container `aja-app-develop` + investigação no `tb-letta-shared`)
- **Origem:** warn recorrente no stdout do app a cada turno que tem fato pra persistir na memória de longo prazo.
- **Severidade (HIPÓTESE não-cravada):** **BAIXA** quanto a estabilidade/resposta (impacto ZERO — best-effort engole o erro, app responde normal) / **MÉDIA-ALTA** quanto a PRODUTO (a memória archival = "o agente lembra entre sessões" está silenciosamente morta enquanto a quota OpenAI estiver zerada → degrada o core value de continuidade). Confirmar na hora de decidir.

## Cenário
- **Rota/tela:** chat web `http://aja-develop.orb.local` — qualquer turno em que o agente tenha um fato novo pra gravar na archival memory.
- **Sintoma no app:** warn recorrente `source:memory, letta_op:store_memories, MemoryTimeoutError: POST .../archival-memory timed out after 8000ms`.
- **Por que aparece pouco no app (1-2 warns):** a maioria dos turnos tem `entries_count:0` (nada a gravar); só falha quando há fato pra persistir. No Letta o problema é sistemático (ver evidência).

## Esperado × Atual
- **Esperado:** insert de archival memory conclui; a memória de longo prazo do agente persiste entre sessões.
- **Atual:** o insert estoura por timeout de 8s e é engolido (best-effort); a archival memory NÃO é gravada. Memória de longo prazo silenciosamente morta enquanto a quota OpenAI do Letta estiver esgotada.

## Causa-raiz (CONFIRMADA — NÃO é Letta lento)
O insert de archival memory gera embeddings via OpenAI; a chave OpenAI do Letta está com **quota esgotada** → `openai.RateLimitError: 429 insufficient_quota`. O retry/backoff do cliente OpenAI estoura o `AbortController` de 8s do app, que então loga `MemoryTimeoutError`. O timeout é o **sintoma**, não a causa.
- **Stack trace do Letta:** `passage_manager.py:579` → `openai_client.py:1197` → `RateLimitError 429`.
- **Escopo (sistemático):** 52 ocorrências de `429 / insufficient_quota` no container `tb-letta-shared` em 120m.
- **Letta saudável e ocioso:** Up 47h healthy, 0.37% CPU / 449MB — NÃO é carga/lentidão do Letta.

## Best-effort CONFIRMADO (o app está correto)
- `src/lib/memory/letta-adapter.ts:237` → `insertArchival(...).catch((err) => logMemoryOp(..., "warn"))` — erro engolido, sem `throw`, app responde normal.
- Timeout de 8s configurado em `src/lib/memory/letta-adapter.ts:576` (default geral 2000ms em `src/lib/memory/letta-client.ts:21`).

## Correção REAL — OPERACIONAL, fora do repo do app → **PENDENTE-KAIRO** (decisão de billing/arquitetura, NÃO executar)
Repor quota/billing da chave OpenAI de embeddings do Letta, **OU** trocar o embedding provider do Letta (config no `embedding_config` do agent / env do `tb-letta-shared`: `OPENAI_API_KEY` / `LETTA_EMBEDDING_*`; candidato: apontar pro **gateway LiteLLM shared**). Decisão do Kairo — blast radius de billing/infra.

## Melhoria OPCIONAL de robustez no código do app (NÃO é a correção)
Elevar o log quando `insertArchival` falha repetidamente por timeout — hoje 52 falhas reais viram 1 warn, **mascarando memória morta**. Já existe `src/lib/memory/circuit-state.ts` pra apoiar (circuit-breaker/contagem). Tornar a falha sistemática VISÍVEL (warn→error após N falhas, ou métrica) sem quebrar o best-effort.

## Tratamento / Regressão
Bug de **infra/best-effort**, NÃO de comportamento do agente → **NÃO exige cassette Camada 2**. Se a melhoria opcional de robustez for implementada, Camada 1 structural cobre o contrato best-effort (`insertArchival` falha → app NÃO quebra → loga; e a elevação warn→error após N falhas), em teste ao lado de `letta-adapter.ts` se ainda não existir.

## Nota — cross-ref ao card da Maria (NÃO cravar)
Relacionado a `2026-06-25-agente-alucina-falha-busca-oferta-stale.md`, onde a investigação viu `archival_hits: 0`. O agent deste timeout (`853502c4`) **NÃO** é o da Maria (`8322b577`), mas o **modo de falha é o mesmo mecanismo**: store de archival falha por 429 → leitura futura retorna 0 hits. Mencionado como pista, **sem cravar** que a memória da Maria morreu por isto.
