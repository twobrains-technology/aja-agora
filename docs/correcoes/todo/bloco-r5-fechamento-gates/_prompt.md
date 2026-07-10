Executor do bloco **bloco-r5-fechamento-gates** (rodada 5) no worktree `fix/r5-fechamento-gates`. Corrige a troca de marca no fechamento + gates por texto (Fable r4 5/10, P1 #2 + regressões).
1. Leia: `docs/correcoes/rodada2-fable/veredito-fable-r4.md` (§P1 #2 + regressões) + `docs/correcoes/todo/bloco-r5-fechamento-gates/` (_bloco.md + fix-259/260/261).
2. LEI: nunca trocar a marca confirmada em SILÊNCIO (o fechamento caía pro global best sem avisar); nunca prometer refazer com marca indisponível (loop). Gate respondido por texto é CONSUMIDO. Ordem: FIX-259 → FIX-260 → FIX-261. TDD strict.
3. INVARIANTES: aviso de troca de marca em CÓDIGO; sem promessa impossível; card = emissão server-side; PT correto; NÃO quebrar FIX r1-r4.
4. 1 commit por item; mover fix-NN pra done/. Ao fim: push da branch + `.done/`. NÃO abra PR/merge/deploy. test:unit VERDE antes do push.
