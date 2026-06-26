---
id: FIX-78
titulo: "Agente dropa o comparison_table no reveal com 2+ grupos (usuário vê só 1 proposta, sem o carrossel comparativo)"
status: todo
bloco: bloco-a-agente-passos-obrigatorios
arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/runner.ts
  - tests/regression/agent-trajectory.test.ts
rodada: "2026-06-25 sessão de QA manual Kairo — jornada chat/fechamento"
---

# Bug — Agente dropa o `comparison_table` no reveal com 2+ grupos (usuário vê só 1 proposta, sem o carrossel comparativo)

- **Natureza:** bug de **comportamento do agente** (não-determinístico) — mesma classe do bug da Maria (passo obrigatório omitido pelo modelo).
- **Data:** 2026-06-25 (teste manual do Kairo — chat web, conv `a9c5effa`)
- **Severidade (HIPÓTESE não-cravada):** MÉDIA — não trava o fluxo, mas degrada a etapa de comparação/escolha (usuário não vê as alternativas). Confirmar na hora de corrigir.

## Cenário
- **Rota/tela:** chat web, reveal de oferta em que a Bevi retornou **2+ grupos**.
- **Sintoma:** o usuário vê só UMA proposta (a recomendada), **sem o carrossel comparativo** das demais.

## Esperado × Atual
- **Esperado:** no ramo 2+ grupos (`src/lib/agent/orchestrator/directives.ts:236-241`) a ordem é OBRIGATÓRIA: `present_recommendation_card` (passo 236) → `present_comparison_table` com **TODOS** os grupos, `highlightBestIndex=0` (passo 237) → `present_simulation_result` (passo 238).
- **Atual:** o agente chamou `present_recommendation_card` mas **NÃO** chamou `present_comparison_table` → viola `directives.ts:237`. (Card único em destaque = design intencional; **ausência do comparativo = BUG**.)

## Evidência (turn-trace)
- `traceId 6b09c87f`, conv `a9c5effa`:
  - `toolsCalled = [search_groups, recommend_groups, present_recommendation_card, simulate_quota, present_simulation_result]`
  - `artifactsEmitted = [recommendation_card, simulation_result]` → **`comparison_table` AUSENTE**.
- **Caveat honesto:** não foi possível extrair do log a contagem exata de grupos que a Bevi devolveu (turn-trace não expõe; payload do artifact não está em `messages.content`). **Mas** o agente ter chamado `present_recommendation_card` **prova** que ele classificou como "2+ grupos" — com 1 só grupo o prompt manda NÃO chamar `recommendation_card` (`directives.ts`). Logo o comparativo era obrigatório e faltou.

## Onde provavelmente mexe (PISTA — fix NÃO fechado)
- `src/lib/agent/orchestrator/directives.ts:236-241` — reforçar no prompt que `recommendation_card` e `comparison_table` são **inseparáveis** no ramo 2+ grupos.
- E/OU **artifact-guard no orchestrator**: vendo `recommendation_card` emitido **sem** `comparison_table` no mesmo reveal (com 2+ grupos em `recommend_groups`), forçar/injetar o comparativo.

## Tratamento (quando for corrigir — NÃO agora) — bug de agente → 3 camadas
- **Camada 2 (cassette OBRIGATÓRIA):** novo `describe` em `tests/regression/agent-trajectory.test.ts` — reveal com `recommendation_card` emitido mas **sem** `comparison_table` (2+ grupos) → detector falha.
- **Camada 1 (structural):** assert da regra de inseparabilidade no prompt produzido por `directives.ts` (ou do artifact-guard).
- **Camada 3 (eval):** cenário de reveal multi-grupo.
- TDD strict: cassette FALHA primeiro → fix no prompt/guard → verde. Commit `test+fix:`.

## Cross-ref
`2026-06-25-agente-alucina-falha-busca-oferta-stale.md` (bug da Maria) — mesma classe: **passo obrigatório da jornada omitido pelo modelo** não-determinístico. Candidatos a artifact-guard de defesa-em-profundidade no orchestrator.
