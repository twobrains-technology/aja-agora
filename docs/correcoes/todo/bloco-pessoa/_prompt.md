Você é o executor do bloco **bloco-pessoa** (`feat/medicao-pessoa`) no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e `docs/correcoes/todo/bloco-pessoa/`
   (`_bloco.md` + cada `fix-NN` — cenário, root cause, correção, regressão exigida).

2. CONTEXTO QUE NÃO PODE SER PERDIDO: o dono já decidiu que **a unidade de medida passa a ser PESSOA**,
   e a definição única JÁ EXISTE: `chaveDaPessoa(de, ate, colunaVisitor)` em
   `src/lib/admin/sinais-do-funil.ts`. **Não crie uma segunda definição de pessoa.** `computePorta`
   (`performance-queries.ts`, por volta de `:265`) já usa essa chave — copie o padrão de lá:
   `count(DISTINCT ${chaveDaPessoa(fromDate, toDate)})` com `JOIN visits v ON v.id = c.visit_id`.

3. DESIGN: não há decisão de design em aberto aqui — a definição de pessoa é fonte única e o desenho do
   `pararamAqui` está no fix-371. Vá direto ao TDD.

4. TDD STRICT (é lógica/número/invariante — não é visual). O teste que falha PRIMEIRO é o caso da
   cliente, escrito em `fix-370`: **5 conversas do MESMO telefone em 16/09 ⇒ 1 pessoa** no degrau de
   proposta, e duas pessoas ⇒ 2. Rode **só** os arquivos que você tocou:
   `pnpm vitest run src/lib/admin/` e, se tocar componente, `pnpm vitest run src/components/admin/performance/`.
   **NÃO rode a suíte inteira** (isso é do gate da integradora) e **NÃO rode smoke/QA de browser**.

5. 1 commit Conventional (PT-BR) por item, na ordem de `itens:`.

6. Ao concluir cada item, mova o `fix-NN` para `docs/correcoes/done/` com `status: done`,
   `commit: <hash>` e `executado_em: <data>` (best-effort — o orquestrador garante via merge).

7. Ao terminar: **push da branch** + gere `.done/{data}-bloco-pessoa.md` (resumo, decisões, testes
   rodados, gaps). **NÃO abra PR, NÃO faça merge, NÃO rode deploy.**

8. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z"), e diga
   com todas as letras QUAIS números mudaram na janela 01–21/09 (antes × depois), se você conseguir
   medir.
