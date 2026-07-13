Você é o executor do bloco `bloco-r10-2-whatsapp-fecho` no worktree isolado deste branch
(`fix/r10-2-whatsapp-fecho`), projeto aja-agora. Este bloco forka da base `integ/consorcio-r10`
JÁ COM a onda 1 integrada (funil reordenado, reveal em dois tempos, invariantes de humanização).

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-r10-2-whatsapp-fecho/` inteiro
   (`_bloco.md` + `fix-303-*.md`).

2. DESIGN: root cause e correção já fechadas no fix-card. Pule o brainstorming formal, exceto se
   encontrar um trade-off real de implementação (ex.: onde exatamente inserir o emit no
   `orchestrator/index.ts` sem duplicar o card em dois pontos) — aí use `AskUserQuestion`.

3. Execute o item. TDD strict (é lógica de negócio — quando o opt-in aparece):
   - Teste de integração: reveal completo SEM `contractFormDispatched` → opt-in NÃO aparece.
   - Teste de integração: `contractFormDispatched=true` → opt-in aparece (respeitando
     `whatsappOptinShown`/`contractRetryPending`).
   - Rode os testes de regressão do FIX-294/295 (`test:integration`) — têm que continuar verdes.
   Rode só os testes dos arquivos tocados. 🚫 Sem smoke de browser neste bloco.

4. 1 commit Conventional (PT-BR).

5. Mova o fix-NN concluído pra `docs/correcoes/done/`.

6. Push da branch (`git push origin fix/r10-2-whatsapp-fecho`) +
   `.done/{data}-bloco-r10-2-whatsapp-fecho.md`. NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart.

7. RESUMO FINAL: decisão de onde exatamente o emit foi movido, linha a linha.
