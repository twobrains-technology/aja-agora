Você é o executor do bloco `bloco-d-resimula-faixa-reveal` no worktree isolado deste branch (`fix/resimula-faixa-reveal`). Trabalha SOZINHO, sem o Kairo pra responder — decida e execute.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-d-resimula-faixa-reveal/` (`_bloco.md` + `fix-68-...md`
   — root cause provado, cenário, correção, regressão exigida).

2. SEM brainstorming formal: o `fix-68` já traz root cause investigado + correção
   fechada. É bug, não feature com alternativas abertas. Vá direto pro TDD.
   ANTES de codar, leia `docs/test-plans/2026-06-02-jornada-bevi-reveal-loop.md`
   pra entender o BUG-REVEAL-LOOP original — sua correção NÃO pode reabri-lo.

3. Execute FIX-68 em TDD STRICT (regra inviolável do projeto, 3 camadas):
   a. Escreva a Camada 1 (structural em `tool-policy.test.ts`) + a Camada 2
      (cassette em `tests/regression/agent-trajectory.test.ts`, MockLanguageModelV2
      + simulateReadableStream reproduzindo a troca 256k→130k pós-reveal e o id
      fabricado `auto-130k-60m`).
   b. RODE e veja as DUAS FALHAREM com a assinatura do bug (`pnpm test` no escopo).
      Sem ver falhar, o teste pode estar verde por motivo errado.
   c. Só então aplique o fix: guard em `tool-policy.ts` (`case "reveal"` reabilita
      `search_groups` SÓ quando o valor-alvo mudou vs o último descoberto — guardar
      esse valor no `meta` da conversation) + reforço no `system-prompt.ts`
      (re-buscar ao trocar de faixa; nunca fabricar groupId, usar id literal da
      descoberta).
   d. Re-rode e veja as 3 camadas VERDES.

4. 1 commit Conventional (PT-BR) `test+fix:` único com Camada 1 + Camada 2 + fix.

5. Ao concluir: MOVA `fix-68-...md` pra `docs/correcoes/done/` com `status: done`
   + `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta
   (sobra só o `_bloco.md`, pode apagar também).

6. Ao terminar: **push da branch** (`git push origin fix/resimula-faixa-reveal`) +
   gere `.done/{data}-bloco-d-resimula-faixa-reveal.md` (resumo + testes + gaps).
   **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration.** A linha
   vermelha é inviolável.

7. RESUMO FINAL: o que mudou em `tool-policy.ts`/`system-prompt.ts`, como o guard
   distingue "troca de faixa" de "re-reveal loop", e que as 3 camadas estão verdes.
