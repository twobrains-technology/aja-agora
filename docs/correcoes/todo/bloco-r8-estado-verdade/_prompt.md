Executor do bloco **bloco-r8-estado-verdade** (rodada 8) no worktree `fix/r8-estado-verdade`. Mata o ÚNICO bloqueador pra prod (Fable r7 8/10): o agente fabrica estado.
1. Leia: `docs/correcoes/rodada2-fable/veredito-fable-r7.md` + `docs/correcoes/todo/bloco-r8-estado-verdade/` (fix-270).
2. LEI 1/4/5: estado NUNCA vem da narrativa do LLM — vem da fonte real (DB/tool-io). Guard em CÓDIGO que dropa/reescreve afirmação de estado sem lastro (documentos recebidos sem upload; re-busca sem tool-call — cruze com turn-trace.toolsCalled). TDD strict.
3. INVARIANTES: defesa em profundidade (sanitizer + fonte real); NÃO quebrar FIX r1-r7. PT correto.
4. 1 commit; mover fix-270 pra done/. Ao fim: push + `.done/`. NÃO abra PR/merge/deploy. test:unit VERDE.
