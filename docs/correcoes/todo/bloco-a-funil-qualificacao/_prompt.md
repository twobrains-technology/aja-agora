Você é o executor do **bloco-a-funil-qualificacao** no worktree isolado deste branch (`fix/funil-qualificacao-v2`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR. Package manager: **pnpm** (nunca npm/yarn).

1. Leia `docs/correcoes/README.md` (se existir) e `docs/correcoes/todo/bloco-a-funil-qualificacao/` — o `_bloco.md` (ordem interna + conflitos) e cada `fix-NN-*.md` (palavras do operador, cenário, root cause JÁ investigado, correção proposta, regressão exigida). Os cards são a fonte de verdade do que "feito" significa.

2. DESIGN: estes são bugs com root cause já fechado nos cards — **PULE brainstorming**. Implemente a correção descrita. Se ao implementar algum item você encontrar um trade-off de produto REAL não previsto no card (ex.: a correção do funil muda o que o usuário vê de um jeito não óbvio), aí sim use `superpowers:brainstorming` e, havendo trade-off, faça a pergunta via `AskUserQuestion` (opção recomendada em 1º, rótulo terminando em "(Recomendado)"). Sem resposta em tempo razoável → siga a recomendada e registre em `docs/correcoes/decisions/2026-06-28-bloco-a.md` (commit `docs:`). Não trave.

3. Execute os itens **NA ORDEM de `itens:` do `_bloco.md`**: FIX-83 → FIX-82 → FIX-84 → FIX-85 → FIX-86. **TDD strict**: para cada item, escreva o teste de regressão PRIMEIRO, rode e VEJA FALHAR com a assinatura certa, depois corrija, rode e veja passar. Bug de comportamento do agente (FIX-86 — frase de fallback) exige as **3 camadas**: Camada 1 structural (`src/**/*.test.ts`) + Camada 2 cassette em `tests/regression/agent-trajectory.test.ts`. FIX-82/85 (prompt) = structural. FIX-83/84 (determinístico) = teste de `analyzeAndMerge`/handler.

4. **1 commit Conventional (PT-BR) por item** — use `test+fix:` (teste de regressão + fix no mesmo commit) para os bugs. Título imperativo minúsculo, sem ponto final.

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: 2026-06-28`. Bloco esvaziou → apague a pasta. (Best-effort — o orquestrador garante via merge-wave; se esquecer, não trava.)

6. Ao terminar TODOS os itens: rode o gate `pnpm test:unit` e veja verde, faça **push da branch** (`git push origin fix/funil-qualificacao-v2`) e gere `.done/2026-06-28-bloco-a-funil-qualificacao.md` (resumo + decisões + testes + gaps). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO crie reminder.** A integração na base é do orquestrador. A tag-sentinela de conclusão é injetada automaticamente — siga o footer.

7. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z" por linha). Sem decisão de design? Diga isso.
