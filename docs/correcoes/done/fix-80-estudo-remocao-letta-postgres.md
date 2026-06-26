---
id: FIX-80
titulo: "ESTUDO/PLANO de remoção do Letta — re-home da memória pro Postgres (NÃO arranca; entrega ADR + plano + stub do PostgresMemoryAdapter)"
status: done
bloco: bloco-c-estudo-remocao-letta
arquivos:
  - docs/correcoes/decisions/2026-06-25-remocao-letta-postgres.md
  - docs/
  - src/lib/memory/postgres-adapter.ts
rodada: "2026-06-25 sessão de QA manual Kairo — jornada chat/fechamento"
executado_em: 2026-06-26
commit: "881bc730 (docs: ADR+plano+move) · 30de3123 (chore: stub)"
entrega: "ESTUDO concluído — ADR (2026-06-25-remocao-letta-postgres.md) + plano de migração faseado + stub não-ligado (src/lib/memory/postgres-adapter.ts). NÃO arrancou o Letta, nenhum código de runtime tocado. PENDENTE-KAIRO: medição em prod (§7 do ADR) antes de executar."
---

# Refactor / Decisão arquitetural (NÃO é bug de runtime) — Estudar a fundo e remover o Letta: re-home da memória pro Postgres

- **Natureza:** **SOLICITAÇÃO DE REFACTOR / DECISÃO ARQUITETURAL** (candidata a bloco `todo-blocks`), NÃO bug de runtime. Nada está quebrado em produção por causa disto; é simplificação de arquitetura. Registrado a pedido do Kairo.
- **Data:** 2026-06-25 (avaliação crítica de arquiteto sênior — Opus — nesta sessão, a pedido do Kairo)
- **Veredito do arquiteto:** **OVERKILL** — o Letta entrega muito menos do que custa neste app.
- **Severidade/prioridade (HIPÓTESE não-cravada):** decisão grande; impacto = redução de custo/complexidade/superfície de falha, não correção de defeito. Priorizar com o Kairo.
- **STATUS:** **PENDENTE-KAIRO** — aprovar a migração (decisão arquitetural grande). NÃO implementar nada sem aval.

## Contexto / Evidência (do relatório do arquiteto)
- **Archival memory (a parte mais cara do Letta — busca semântica via embeddings) está MORTA há tempos** (OpenAI 429 — ver `2026-06-25-letta-archival-timeout-mascara-openai-429.md`) e o produto seguiu **sem impacto perceptível de UX**. Prova empírica de que ninguém depende dela hoje.
- **O diferencial do Letta (memória agêntica self-editing) tem ZERO uso no código:** o app faz `PATCH`/`POST` direto no bloco, nunca invoca o loop agêntico. Há um `model: claude-haiku-4-5` setado por agent (`src/lib/memory/letta-adapter.ts:508`) que nunca gera nada. O Letta é usado como **KV-store REST caro e remoto**.
- **O que chega ao prompt** (`[CONTEXTO DO USUÁRIO]` / `[REATIVAÇÃO]`) **é projeção DETERMINÍSTICA (sem LLM)** do `conversations.metadata`, montada por `src/lib/memory/extractor.ts` — dados que o app **já tem no Postgres**.
- **Custo atual:** ~2.131 LOC em `src/lib/memory/` + ~10 call-sites + container ECS shared (`tb-letta-shared`) + Cloud Map SRV discovery + dependência externa OpenAI (ponto único de falha, **já caiu**) + circuit-breaker/timeouts/lock anti-race + 6 env vars (`LETTA_*`) + memória injetada **EM DOBRO** por turno (ver `2026-06-25-system-messages-prompt-injection-warning.md`).
- **Nada quebra sem Letta:** degrada limpo em todos os caminhos (cai pra `NoopMemoryAdapter`). Read-side nunca dá `throw` (`letta-adapter.ts:204-222`); write-side é fire-and-forget (`orchestrator/index.ts:221`).

## Proposta (caminho de simplificação — esforço baixo-a-médio)
- Substituir `LettaMemoryAdapter` por um **`PostgresMemoryAdapter`** mantendo a interface `MemoryAdapter` (o **adapter pattern já existe** = corte limpo). 1 tabela `jsonb` keyed por identidade (o `extractor` já produz o patch → `upsert`).
- **pgvector pro archival é OPCIONAL / fase 2** (hoje está morto mesmo); se for reativado, embeddings poderiam ir pelo **gateway LiteLLM shared** em vez de OpenAI direto.
- **NÃO deletar a memória/continuidade entre sessões** — é feature de produto alinhada ao core value. O veredito é overkill **DO LETTA**, não da memória. Apenas **RE-HOME** pro Postgres.
- **Preservar o comportamento de reativação** (cobrir com os testes `reactivation`/`reconciler` já existentes).

## Pré-requisitos de ESTUDO (antes de remover — o arquiteto NÃO confirmou; exige medição em PROD)
> O veredito é "forte por inferência de código" mas **não cravado por dado**. **Medição é a primeira sub-tarefa do bloco** — sem (1) e (2), não aprovar a remoção.
1. Qual `MEMORY_ADAPTER` está ativo em prod (`letta` vs `noop`) + taxa real de **circuito-aberto**.
2. Taxa real de **recall/reativação** em prod: quantos turnos recebem `[CONTEXTO DO USUÁRIO]` / `[REATIVAÇÃO]` **não-vazio**; quantos web-anônimos cruzam o threshold de 3 turnos + cookie pra virar identidade.
3. Confirmar **uso real de `reconcileIdentity` web→WhatsApp** em prod.

## Tratamento (quando virar bloco — NÃO agora)
Refactor com troca de adapter atrás de interface estável → TDD: preservar contrato `MemoryAdapter` (read não-throw, write fire-and-forget, degradação limpa) + cobrir reativação/reconciliação com os testes existentes. NÃO é bug de comportamento de agente → não exige cassette Camada 2; estrutural cobre o contrato do novo adapter. Primeira sub-tarefa = a MEDIÇÃO dos 3 pré-requisitos antes de qualquer remoção.

## Cross-ref (cards de hoje)
- `2026-06-25-letta-archival-timeout-mascara-openai-429.md` — archival morto por OpenAI 429 (a evidência empírica de que ninguém depende do archival).
- `2026-06-25-system-messages-prompt-injection-warning.md` — dupla injeção da memória Letta por turno (parte do custo que esta remoção elimina).
