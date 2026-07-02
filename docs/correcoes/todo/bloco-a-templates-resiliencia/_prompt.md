Você é o executor do bloco `bloco-a-templates-resiliencia` no worktree isolado deste branch (`fix/whatsapp-templates-resiliencia`).

1. Leia `docs/correcoes/README.md` (regras do fluxo, se existir) e
   `docs/correcoes/todo/bloco-a-templates-resiliencia/` — `_bloco.md` + cada `fix-NN`
   (root cause, cenário, correção proposta, regressão exigida). Tudo já vem investigado.

2. SEM fase de design: os três itens são correções de resiliência com root cause + correção
   fechados. NÃO use brainstorming; NÃO abra AskUserQuestion. Vá direto ao TDD.

3. Execute os itens NA ORDEM `FIX-206 → FIX-207 → FIX-208`. Para cada um, TDD strict:
   escreva o teste PRIMEIRO na Camada 1 (structural/unit/integração de rota, ao lado do
   código, rodando em `pnpm test:unit`), veja FALHAR, aplique o fix, veja PASSAR.
   - Nenhum é bug de comportamento de agent/LLM → **NÃO** precisa de cassette
     (`tests/regression/agent-trajectory.test.ts`). Camada 1 cobre. Não invente cassette.
   - Siga as convenções de teste já existentes na feature (ex.:
     `src/app/api/admin/whatsapp/templates/route.integration.test.ts`,
     `templates-guard.test.ts`, `template-status-meta.test.ts`).

4. 1 commit Conventional (PT-BR) por item, formato `test+fix: ...` (teste + correção juntos).

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done`,
   `commit: <hash>`, `executado_em: 2026-07-02`. Bloco esvaziou → apague a pasta do bloco.
   (Best-effort — o orquestrador reconcilia se você esquecer.)

6. Ao terminar: **push da branch** (`git push origin fix/whatsapp-templates-resiliencia`) +
   gere `.done/2026-07-02-bloco-a-templates-resiliencia.md` (resumo + testes + gaps).
   **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO toque develop/main.**
   A integração na base é do ORQUESTRADOR. A tag-sentinela é injetada automaticamente.

7. RESUMO FINAL: como não há decisão de design, diga isso explicitamente e liste os 3 fixes
   com o hash de cada commit e o resultado do gate `pnpm test:unit`.

Gate do projeto: `pnpm test:unit` (NÃO typecheck — há dívida de typecheck na develop alheia ao bloco).
