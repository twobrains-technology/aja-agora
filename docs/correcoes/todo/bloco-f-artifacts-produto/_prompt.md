⚠️ BLOCO SEGURADO — NÃO LANÇAR sem o aval do Bernardo (ver `_bloco.md`). Este `_prompt.md` fica pronto pra quando o Kairo liberar.

Você é o executor do **bloco-f-artifacts-produto** no worktree isolado deste branch (`feat/artifacts-jornada-produto`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR. Package manager: **pnpm**.

0. **GATE DE PRODUTO (ler primeiro):** ⚠️ atualizado em 2026-07-20 — `docs/jornada/jornada-canonica.md` **não existe mais** (rebaixado a `docs/jornada/decisoes-do-cliente.md`, histórico sem poder normativo; o `jornada.docx` que o originou foi REVOGADO em 2026-07-13 por engessar o agente — ver `docs/decisoes/blocos/2026-07-13-revoga-jornada-soberana-desamarra-agente.md`). Estes dois itens mexem em conceito de produto que segue dependente do **aval do Bernardo** (simulador do passo 4 — isso não mudou, é gate humano de stakeholder, não de documento) e em COPY de conversa (recomendação), que é do modelo/produto, não trava em documento. Você só está rodando porque o Kairo liberou. Não trave a nova copy contra um docx — valide contra a referência viva (`docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/`) e registre a decisão de UX (já fechada nos cards `fix-95`/`fix-96`) num bloco "PENDENTE-Bernardo" no `.done/` se algo ficar em aberto.

1. Leia `docs/correcoes/README.md` (se existir), `docs/jornada/decisoes-do-cliente.md` (histórico + invariantes duros — o conceito do simulador do Bernardo é decisão de produto, não regra de copy) e `docs/correcoes/todo/bloco-f-artifacts-produto/` — `_bloco.md` + os cards `fix-95`/`fix-96` (a decisão de UX já foi fechada com o Kairo e está detalhada lá).

2. DESIGN: a UX já foi decidida com o Kairo (está nos cards). NÃO reabra o conceito. Implemente o que está fechado. Trade-off de implementação novo → `superpowers:brainstorming` + `AskUserQuestion` (recomendada em 1º), registre em `docs/correcoes/decisions/2026-06-28-bloco-f.md`.

3. Execute **NA ORDEM**: FIX-95 (simulador só-valor) → FIX-96 (remover teto de 3: 1 hero + 5 + ver todas com ordenar/filtrar). TDD: ajuste/escreva os testes dos artifacts primeiro (os asserts atuais de `plan-estimate-picker.test.tsx`, `recommendation-card.*.test.tsx`, `comparison-table.*.test.tsx` provavelmente quebram — atualize-os pra refletir o novo design). FIX-96: a LLM cura só os 6 do destaque (token-safe); a lista completa vai backend→artifact sem passar pela LLM.

4. **1 commit Conventional (PT-BR) por item** (`feat:` / `test+feat:`).

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit` + `executado_em`. Bloco esvaziou → apague a pasta.

6. Ao terminar: `pnpm test:unit` verde, **push da branch** + gere `.done/2026-06-28-bloco-f-artifacts-produto.md` — com uma seção **PENDENTE-Bernardo** listando o que precisa do aval dele (copy da jornada, conceito final do simulador) antes de ir pra produção. **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration.**

7. RESUMO FINAL: decisões de design + o que ficou PENDENTE-Bernardo.
