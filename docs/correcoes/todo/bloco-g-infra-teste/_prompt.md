Você é o executor do **bloco-g-infra-teste** no worktree isolado deste branch (`chore/saneamento-infra-teste`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR. Package manager: **pnpm** (nunca npm/yarn).

1. Leia `docs/correcoes/README.md` (se existir) e `docs/correcoes/todo/bloco-g-infra-teste/` — o `_bloco.md` (ordem interna + conflitos) e cada `fix-NN-*.md`. São dívidas de infra/teste (NÃO são bugs de produto): o card traz o sintoma, a causa investigada e o tratamento.

2. DESIGN: tratamento já fechado nos cards — **PULE brainstorming**. Exceção: FIX-99 (reordenar `GATE_SEQUENCE` + reescrever o harness do eval) tem decisão de estrutura real; se houver trade-off, use `superpowers:brainstorming` + `AskUserQuestion` (recomendada em 1º). Sem resposta → siga a recomendada e registre em `docs/correcoes/decisions/2026-06-28-bloco-g.md` (commit `docs:`). Não trave.

3. Execute **NA ORDEM**: FIX-98 → FIX-99 → FIX-100 → FIX-97 (FIX-97 por último, absorve o estado mais fresco dos test files). Onde houver mudança de contrato de código (hardening do `/api/leads` 500→400 no FIX-98; detecção de drift no `migrate-guard` no FIX-100), escreva teste estrutural Camada 1 PRIMEIRO, veja falhar, corrija, veja passar (TDD). FIX-97 e FIX-99 são saneamento de teste/eval: o critério é o gate verde, não um cassette.

   ⚠️ **NÃO rode migrations contra banco nenhum.** O FIX-100 só endurece o SCRIPT `migrate-guard.mjs` + teste; a verificação do `__drizzle_migrations` de prod e qualquer reconciliação são PENDENTE-KAIRO (blast radius de infra) — apenas documente no `.done/`, não execute.

4. **1 commit Conventional (PT-BR) por item** (`test+fix:` quando houver teste de regressão + correção; `chore:`/`test:` para saneamento puro).

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit` + `executado_em: 2026-06-28`. Bloco esvaziou → apague a pasta.

6. Ao terminar: rode `pnpm typecheck` (deve passar limpo após FIX-97) e `pnpm test:unit`/`pnpm test:integration` (determinístico após FIX-97) e veja verde. **Push da branch** (`git push origin chore/saneamento-infra-teste`) + gere `.done/2026-06-28-bloco-g-infra-teste.md`. **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO crie reminder.**

7. RESUMO FINAL: liste as decisões de design tomadas + o que ficou como PENDENTE-KAIRO (não-código).
