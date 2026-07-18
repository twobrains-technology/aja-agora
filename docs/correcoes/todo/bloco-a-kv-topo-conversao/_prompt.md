Você é o executor do bloco bloco-a-kv-topo-conversao no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-a-kv-topo-conversao/` (`_bloco.md` + `fix-351-*.md` —
   root cause, cenário, correção, regressão exigida) antes de tocar em código.

2. Sem decisão de design em aberto — o `fix-351` já traz a correção fechada
   (contrato `onOpenChat`/`TheaterOpener`, átomos `kv/ui/*` já prontos na base, seeds
   por CTA). Pule o brainstorming. Única exceção pontual: se o "Entrar" do menu
   levantar dúvida sobre criar ou não uma rota nova — NÃO crie, siga o card (deixar
   inerte/documentado) sem perguntar.

3. Execute o FIX-351 seguindo a tabela de correção do card. TDD proporcional: a
   lógica de CTA (onClick → onOpenChat com o seed certo) é lógica de negócio → TDD
   strict (escreva o teste, veja falhar, corrija, veja passar). Responsividade pura
   (breakpoints, larguras) é visual → sem teste, implemente direto. Rode SÓ
   `vitest run src/components/kv` — nunca a suíte inteira. 🚫 Não rode smoke/QA de
   browser neste bloco (a validação visual roda 1x na base integrada, depois da
   onda).

4. 1 commit Conventional (PT-BR) — pode ser mais de um se fizer sentido dividir
   menu/hero/tipos, mas prefira um commit coeso por item concluído.

5. Ao concluir: mova `fix-351-*.md` pra `docs/correcoes/done/` com `status: done` +
   `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta
   `bloco-a-kv-topo-conversao/`. (Best-effort — o orquestrador garante isso no
   merge de qualquer forma.)

6. Ao terminar: **push da branch** (`git push origin feat/kv-topo-conversao`) + gere
   `.done/{data}-bloco-a-kv-topo-conversao.md` (resumo + decisões + testes + gaps —
   inclua a lacuna do "Entrar" sem rota). **NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart, NÃO crie reminder.** A integração na base é do orquestrador.

7. RESUMO FINAL: liste as decisões que você tomou ("decidi X em vez de Y porque Z")
   por linha — em especial qualquer ajuste de breakpoint que não estava explícito
   no card.
