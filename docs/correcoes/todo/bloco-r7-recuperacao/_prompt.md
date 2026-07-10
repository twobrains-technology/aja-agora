Executor do bloco **bloco-r7-recuperacao** (rodada 7) no worktree `fix/r7-recuperacao`. Fecha o que segura a nota em 7/10 (Fable r6): recuperação enlatada/lenta + menção por parcela/prazo.
1. Leia: `docs/correcoes/rodada2-fable/veredito-fable-r6.md` ("o que segura o 7") + `docs/correcoes/todo/bloco-r7-recuperacao/` (_bloco.md + fix-266/267).
2. IDEIA-CHAVE: transformar CONTENÇÃO em RESOLUÇÃO — no caminho de recuperação (tool-error/fallback), rodar o resolver de menção sobre a mensagem do usuário ANTES do fallback enlatado. Ordem: FIX-266 → FIX-267. TDD strict.
3. INVARIANTES: ancora sobre entidade em tela; fallback nunca repete idêntico; determinístico. NÃO quebrar FIX r1-r6. PT correto.
4. 1 commit por item; mover fix-NN pra done/. Ao fim: push da branch + `.done/`. NÃO abra PR/merge/deploy. test:unit VERDE antes do push.
