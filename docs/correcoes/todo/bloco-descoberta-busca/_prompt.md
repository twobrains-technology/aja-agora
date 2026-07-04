Você é o executor do **bloco-descoberta-busca** no worktree isolado deste branch (`feat/descoberta-valor-busca-embutido`). Projeto: aja-agora (Next.js + Vercel AI SDK 6, integra a API Bevi/UXVision). Idioma: **PT-BR correto (com acentos)**. Package manager: **pnpm** (nunca npm/yarn).

1. **Leia primeiro:** `docs/jornada/jornada-canonica.md` — seção **"Refino Ata 2026-07-04"** (itens 3 valor digitável, 4 busca com/sem embutido). Depois `docs/correcoes/todo/bloco-descoberta-busca/` (`_bloco.md` + os cards FIX-218/219 com root cause `file:line`, correção e regressão).

2. **DESIGN:** os dois itens já vêm fechados nos cards (root cause investigado + correção). Não reabra o conceito. Trade-off de implementação novo (ex.: como estruturar o eixo com/sem embutido no sweep) → resolva com bom senso de sênior e registre 1 linha no `.done/`. Só use `superpowers:brainstorming` + `AskUserQuestion` se aparecer uma decisão de produto real (improvável aqui).

3. **Execute NA ORDEM:** FIX-218 (valor digitável) → FIX-219 (busca com/sem embutido). **TDD strict**: teste que reproduz o cenário primeiro (ex.: digitar 1.012.000 mantém o valor; busca retorna com+sem embutido deduplicados), vê falhar, corrige, vê passar.
   - ⚠️ Assumir ~30% de embutido por ora (Ata). Caso de borda (cota não permite embutido) **NÃO** é escopo deste bloco — não travar a experiência por isso.
   - ⚠️ NÃO capar o valor digitado (o slider mantém min/max só como dica visual).

4. **1 commit Conventional (PT-BR) por item.**

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` (`status: done` + `commit` + `executado_em: 2026-07-04`). Bloco esvaziou → apague a pasta.

6. Ao terminar: `pnpm test:unit` verde + **push da branch** (`git push origin feat/descoberta-valor-busca-embutido`) + gere `.done/2026-07-04-bloco-descoberta-busca.md`. **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration.**

7. **RESUMO FINAL:** decisões de implementação relevantes (ex.: forma do eixo com/sem embutido) e gaps. Sem decisão relevante? Diga isso.
