Você é o executor do bloco `bloco-r10-1-sanitizer-invariantes` no worktree isolado deste branch
(`fix/r10-1-sanitizer-invariantes`), projeto aja-agora.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-r10-1-sanitizer-invariantes/`
   inteiro (`_bloco.md` + `fix-298-*.md` + `fix-299-*.md`).

2. DESIGN: os fix-cards já trazem root cause + correção proposta fechada — não é decisão de
   design nova, pule o brainstorming formal.

3. Execute os itens (ordem livre, FIX-298 e FIX-299 são independentes entre si). TDD strict pra
   ambos (é lógica/invariante, não copy solto):
   - **FIX-298:** escreva o cassette de regressão com a transcrição REAL do bug ("Quer ajustar o
     valor do bem ou seguir com essa opção da ITAÚ mesmo? Você já fez consórcio antes?") — veja
     falhar, implemente o corte por SENTENÇA interrogativa no `EphemeralTextFilter`, veja passar.
     Escreva TAMBÉM um teste POSITIVO com a frase composta do mockup ("que carro... e quanto
     custa?") confirmando que ela NÃO é cortada — isso é obrigatório, não opcional.
   - **FIX-299:** teste unitário de capitalização determinística do `contactName` (nome digitado
     em minúsculo/maiúsculo vira Title Case correto, respeitando partículas "de"/"da"/"dos") +
     teste de strip de emoji independente do texto vindo do LLM.
   Rode só os testes dos arquivos tocados. 🚫 Sem smoke de browser neste bloco.

4. 1 commit Conventional (PT-BR) por item.

5. Mova cada fix-NN concluído pra `docs/correcoes/done/` (status: done + commit + executado_em).

6. Push da branch (`git push origin fix/r10-1-sanitizer-invariantes`) + `.done/{data}-bloco-r10-1-sanitizer-invariantes.md`.
   NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart.

7. RESUMO FINAL: decisões tomadas (se houver) linha a linha.
