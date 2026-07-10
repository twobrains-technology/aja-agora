Executor do bloco **bloco-r8-acabamento** (rodada 8) no worktree `fix/r8-acabamento`. O acabamento honesto do Fable r7 (8/10).
1. Leia: `docs/correcoes/rodada2-fable/veredito-fable-r7.md` + `docs/correcoes/todo/bloco-r8-acabamento/` (fix-271/272).
2. Ordem: FIX-271 (empty-turn roda resolver) → FIX-272 (voz). TDD strict.
3. INVARIANTES: PT correto sem "reserva" pré-contratação; 1 balão = 1 ideia; sem turno morto. NÃO quebrar FIX r1-r7.
4. 1 commit por item; mover fix-NN pra done/. Ao fim: push + `.done/`. NÃO abra PR/merge/deploy. test:unit VERDE.
