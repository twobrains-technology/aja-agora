Você é o executor do bloco `bloco-r10-2-bakeoff-regua` no worktree isolado deste branch
(`fix/r10-2-bakeoff-regua`), projeto aja-agora. Este bloco forka da base `integ/consorcio-r10` JÁ
COM a onda 1 integrada (funil reordenado, reveal em dois tempos, sanitizer com invariantes novos).

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-r10-2-bakeoff-regua/` inteiro
   (`_bloco.md` + `fix-304-*.md`).

2. PRIMEIRO PASSO OBRIGATÓRIO: leia `src/lib/agent/orchestrator/sanitizer.ts` atual e confirme se
   o FIX-299 (onda 1, já integrado) já cobre strip de emoji + capitalização do `contactName`. Se
   já cobre, NÃO reimplemente — documente no `.done/` que já estava resolvido e pule essa parte.

3. Re-rode `scripts/bakeoff.sh` com `AI_MODEL` pro Qwen (mesma config do `.bakeoff/qwen-jornada.log`
   anterior) e registre o NOVO score no arquivo `.bakeoff/qwen-jornada-pos-r10-onda1.log` (ou nome
   similar, não sobrescreva o anterior — precisamos comparar antes/depois).

4. Investigação do chunking (P10): SE você tiver acesso a rodar uma conversa real via Qwen com
   turn-trace habilitado, confirme ou refute a hipótese de frases coladas no `gateway-openai.ts`.
   NÃO proponha fix de código sem essa confirmação — se não conseguir confirmar, documente como
   dúvida aberta no `.done/`, não invente.

5. TDD proporcional: se algo em `sanitizer.ts`/`gateway-openai.ts` precisar de fix de código de
   verdade (não coberto pelo passo 2), siga TDD strict. Rode só os testes dos arquivos tocados.
   🚫 Sem smoke de browser neste bloco.

6. 1 commit Conventional (PT-BR) por mudança real de código. O re-rodar do bakeoff pode ser
   `docs:`/`chore:` (não é mudança de produto).

7. Mova o fix-NN concluído pra `docs/correcoes/done/`.

8. Push da branch (`git push origin fix/r10-2-bakeoff-regua`) +
   `.done/{data}-bloco-r10-2-bakeoff-regua.md` com o SCORE NOVO do bakeoff em destaque (comparado
   ao anterior 0.774) e a conclusão sobre P10 (confirmado/refutado/inconclusivo). NÃO abra PR, NÃO
   faça merge, NÃO rode deploy/restart.

9. RESUMO FINAL: score do bakeoff antes×depois, o que mudou em código (se algo), conclusão sobre P10.
