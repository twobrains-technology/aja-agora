Você é o executor do bloco `bloco-f-simula-grupo-comparison` no worktree isolado deste branch (`fix/simula-grupo-comparison`). Trabalha SOZINHO — decida e execute, não trave esperando aprovação.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-f-simula-grupo-comparison/` (`_bloco.md` + `fix-71-...md`
   — root cause provado no log, cenário ao vivo, correção, regressão exigida).
   Contexto: este é o bug IRMÃO do FIX-68 (já mergeado na develop) — leia o que o
   FIX-68 fez em `tool-policy.ts`/`system-prompt.ts` pra não regredir e pra alinhar a abordagem.

2. SEM brainstorming formal: o `fix-71` traz root cause investigado + correção fechada.
   É bug. Vá direto pro TDD. Confirme primeiro a hipótese lendo o que
   `present_comparison_table`/`present_recommendation_card` (em `ai-sdk.ts` +
   `comparison-table.tsx`) expõem como id de cada grupo.

3. TDD STRICT (3 camadas — regra inviolável):
   a. Camada 1 (structural) + Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`
      reproduzindo "escolher grupo da comparison → simulate_quota com id fabricado
      `bb-auto-200k-72m`").
   b. RODE e veja as DUAS FALHAREM com a assinatura do bug.
   c. Corrija: exponha o quotaId real nos cards / resolva a escolha server-side +
      reforço no prompt (usar id LITERAL do grupo escolhido, nunca fabricar). PRESERVE
      a degradação graciosa (não voltar pro loop de "instabilidade").
   d. Re-rode e veja as 3 camadas VERDES.

4. GATE VERDE DO PROJETO = `pnpm test:unit` (vitest). ⚠️ NÃO use `pnpm typecheck`/`tsc`
   como gate — a develop tem ~25 erros de tsc PRÉ-EXISTENTES em arquivos de teste (dívida
   antiga, fora do escopo); o pre-commit do projeto roda `test:unit`, não tsc. Confie no `test:unit`.

5. 1 commit Conventional (PT-BR) `test+fix:` único com Camada 1 + Camada 2 + fix.

6. Ao concluir: MOVA `fix-71-...md` pra `docs/correcoes/done/` com `status: done` +
   `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta.

7. Ao terminar: **push da branch** (`git push origin fix/simula-grupo-comparison`) +
   gere `.done/{data}-bloco-f-simula-grupo-comparison.md` (resumo + testes + gaps).
   **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration.** Linha vermelha inviolável.

8. RESUMO FINAL: o que mudou (cards expõem id real? resolução server-side? reforço de prompt?),
   como o cassette reproduz o `bb-auto-200k-72m`, e que as 3 camadas estão verdes via `test:unit`.
