Executor do bloco **bloco-r6-mencao-polish** (rodada 6) no worktree `fix/r6-mencao-polish`. Resolve o resolver-de-menção + menores (Fable r5 5/10).
1. Leia: `docs/correcoes/rodada2-fable/veredito-fable-r5.md` + `docs/correcoes/todo/bloco-r6-mencao-polish/` (_bloco.md + fix-264/265).
2. LEI: menção nome/valor que casa um grupo EXIBIDO resolve DETERMINÍSTICO (nunca desistir/negar). Ordem: FIX-264 (menção v2) → FIX-265 (menores). TDD strict.
3. INVARIANTES: ancora sobre entidade em tela; acento correto nos nomes da Bevi; copy condicional (WhatsApp enviado vs enfileirado). NÃO quebrar FIX r1-r5. PT correto.
4. 1 commit por item; mover fix-NN pra done/. Ao fim: push da branch + `.done/`. NÃO abra PR/merge/deploy. test:unit VERDE antes do push.
