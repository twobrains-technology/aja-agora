Executor do bloco **bloco-r7-voz-polish** (rodada 7) no worktree `fix/r7-voz-polish`. Residuais de voz + observabilidade (Fable r6 7/10).
1. Leia: `docs/correcoes/rodada2-fable/veredito-fable-r6.md` + `docs/correcoes/todo/bloco-r7-voz-polish/` (_bloco.md + fix-268/269).
2. Ordem: FIX-268 (voz: reserva/dedup/picotamento) → FIX-269 (observabilidade). TDD strict.
3. INVARIANTES: PT correto, sem "reserva" pré-contratação; 1 balão = 1 ideia; educação 1× por turno; turn-trace fiel (Lei 5). NÃO quebrar FIX r1-r6.
4. 1 commit por item; mover fix-NN pra done/. Ao fim: push da branch + `.done/`. NÃO abra PR/merge/deploy. test:unit VERDE antes do push.
