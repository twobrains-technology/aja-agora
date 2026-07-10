Executor do bloco **bloco-r5-toolinput-rota** (rodada 5) no worktree `fix/r5-toolinput-rota`. Corrige a espiral de negação (Fable r4 5/10, P1 #1) da jornada de consórcio.
1. Leia: `docs/correcoes/rodada2-fable/veredito-fable-r4.md` (§P1 #1 + FIX-252 não-feito) + `docs/correcoes/todo/bloco-r5-toolinput-rota/` (_bloco.md + fix-257/258).
2. LEI: falha de tool NÃO pode ser silenciosa (`output:null` vira "não existe" pro LLM → nega ofertas reais). Coage o input (o LLM erra o tipo, o código conserta) e faz erro barulhento. Rota determinística nome→grupo ANTES do LLM (Lei 1/4). Ordem: FIX-257 → FIX-258. TDD strict.
3. INVARIANTES: `z.coerce.number()` nos inputs numéricos; nunca negar oferta exibida na tabela; ancora sobre entidade em tela. NÃO quebrar FIX r1-r4. PT correto.
4. 1 commit por item; mover fix-NN pra done/. Ao fim: push da branch + `.done/`. NÃO abra PR/merge/deploy. test:unit VERDE antes do push.
