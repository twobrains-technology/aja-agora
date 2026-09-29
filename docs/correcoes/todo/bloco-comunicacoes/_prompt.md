Você é o executor do bloco **bloco-comunicacoes** (`feat/comunicacoes-por-fase`) no worktree isolado
deste branch.

1. Leia `docs/correcoes/README.md`, `docs/decisoes/blocos/2026-09-28-decisoes-da-frente-aja.md` e
   `docs/correcoes/todo/bloco-comunicacoes/`.

2. CONTEXTO (reunião de 22/09, Kairo 12:02:49): a comunicação passa a ser por **macro-fase do funil** —
   *"se o cara tá no início… ele chegou até visualizar a oferta… Já tá no finalzinho, é só fechar?… a gente
   fecharia nesses três"* — e, quando o bem é conhecido, a mensagem diz o bem (Bruna, 12:04:46).

3. REGRA DURA (restrição global do PRD): **nenhum texto de comunicação vira texto fixo no servidor.**
   A função pura NÃO decide se o template existe/aprovado — ela devolve a **LISTA ORDENADA de chaves
   candidatas** (`[fase+bem, genérico]`) e quem resolve é o `template-dispatch`, que já enfileira quando
   não há aprovado. Contrato explícito, para a função pura continuar pura.

4. TDD STRICT: (a) teste puro de `faseDoFunil(sinais)` nos três estados; (b) teste puro das chaves
   candidatas e da ordem de fallback; (c) teste do dispatcher escolhendo ou **enfileirando** (nunca
   sumindo em silêncio). Antes de criar `teve_proposta`, **extraia** o fragmento que hoje está duplicado
   em `percurso-queries.ts`, `performance-queries.ts` e `exportacao/percurso.ts` para
   `sinais-do-funil.ts` — não crie a quarta definição.
   Rode só o que tocar: `pnpm vitest run src/lib/remarketing/` e `pnpm vitest run src/lib/whatsapp/`.
   **NÃO rode a suíte inteira** e **NÃO rode smoke de browser**.

5. 🚫 **NÃO DISPARE MENSAGEM REAL** nem submeta template na Meta. Este bloco não fala com a Graph API.

6. 1 commit Conventional (PT-BR) por item. Mova o `fix-NN` para `done/` (best-effort). ADR em
   `docs/decisoes/blocos/2026-09-28-bloco-comunicacoes.md`.

7. Ao terminar: **push da branch** + `.done/{data}-bloco-comunicacoes.md`. **NÃO abra PR, NÃO faça merge,
   NÃO rode deploy.**

8. RESUMO FINAL: as chaves candidatas exatas que você gerou por fase e a ordem de fallback — o dono vai
   cadastrar os templates com esses nomes.
