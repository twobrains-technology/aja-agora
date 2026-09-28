Você é o executor do bloco **bloco-percurso9** (`feat/percurso-lista-parados`) no worktree isolado
deste branch.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-percurso9/` (`_bloco.md` + cada `fix-NN`).

2. CONTEXTO: a cliente (Bruna) precisa LIGAR para os leads parados. Ela pediu, na reunião de 22/09:
   *"Eu preciso saber quem são esses nove… eles continuam parados desde a semana passada"* — e, em
   25/09: *"temos o contato do cliente, certo? digo aquele telefone, eu poderia ligar para ele, certo?"*.
   O shape da lista hoje não entrega autor da última interação nem o motivo de a pessoa estar fora da
   régua, e ordena pela atividade mais RECENTE (o oposto do que ela pergunta).

3. OVERLAP CONHECIDO (nível 2): o bloco `bloco-pessoa` (paralelo) também edita
   `src/lib/admin/percurso-types.ts`, `src/lib/admin/percurso-queries.ts` e `src/lib/exportacao/`, em
   regiões diferentes. **Faça a sua parte e deixe o merge com o orquestrador** — e NÃO reformate o
   arquivo inteiro, porque isso vira conflito real.

4. DESIGN: sem decisão de design em aberto — a ordem "parado há mais tempo primeiro" é o pedido literal
   da cliente (`fix-382`). Se você achar um motivo forte para não mudar a ordenação default, registre no
   ADR `docs/decisoes/blocos/2026-09-28-bloco-percurso9.md` em vez de decidir sozinho.

5. TDD STRICT para 382 e 384 (lógica/invariante) e para 383 (o recorte tem que casar com a lista).
   Rode só o que tocar: `pnpm vitest run src/lib/admin/` e `pnpm vitest run src/lib/exportacao/`.
   **NÃO rode a suíte inteira** e **NÃO rode smoke/QA de browser**.

6. PII: em teste e em fixture use telefone/e-mail FALSOS. Nada de dado de cliente real em arquivo
   versionado (regra do repo).

7. 1 commit Conventional (PT-BR) por item, na ordem de `itens:`.

8. Ao concluir cada item, mova o `fix-NN` para `docs/correcoes/done/` com `status: done`, `commit:` e
   `executado_em:` (best-effort).

9. Ao terminar: **push da branch** + `.done/{data}-bloco-percurso9.md`. **NÃO abra PR, NÃO faça merge,
   NÃO rode deploy.**

10. RESUMO FINAL: as decisões de design que você tomou e o shape final da pessoa na lista (nomes
    exatos dos campos) — o dono vai usar isso para montar a entrega "quem são os 9".
