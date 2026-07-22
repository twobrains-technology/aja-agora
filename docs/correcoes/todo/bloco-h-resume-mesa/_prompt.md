Você é o executor do bloco bloco-h-resume-mesa no worktree isolado deste branch (forka da base
já com o bloco G — remoção de "Serviços" — integrado).

**Modo de urgência (pedido explícito do operador):** priorize velocidade. TDD estrito só onde
há lógica/invariante real (os dois itens abaixo são exatamente isso — não pule o teste).

1. Leia `docs/correcoes/README.md` e esta pasta (`_bloco.md` + `fix-364-...md` +
   `fix-365-...md`). Leia também `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md`
   (ITENS 2 e 3) pro contexto da campanha — a fonte de verdade da correção são os fix cards.

2. **Sem decisão de design nova** — a decisão de manter `proposta_enviada` no aceite (FIX-365)
   já foi tomada por default recomendado no goal doc. Não pergunte de novo.

3. **FIX-364 primeiro:**
   - Leia `src/lib/agent/qualify-state.ts` (`nextGate`, por volta da linha 237) e
     `src/lib/chat/resume.ts` (por volta da linha 56 e 120-125) pra entender o fluxo atual.
   - TDD strict: escreva o teste que falha primeiro — com `contractClosed: true` (ou o campo
     equivalente que você encontrar em meta) em meta, `nextGate` NÃO deve retornar
     `two_paths`/`decision`/nenhum gate de qualificação anterior; deve retornar um gate
     terminal.
   - Implemente o short-circuit em `nextGate`.
   - Ajuste `resume.ts` pra, ao detectar esse gate terminal, montar a saudação de retomada
     reconhecendo o fechamento e reforçando o encaminhamento pro WhatsApp — a COPY exata é do
     modelo/prompt (não trave em regex/texto fixo), mas o FATO "proposta fechada" deve chegar
     como dado determinístico.
   - Rode o teste, veja passar.

4. **FIX-365 depois:**
   - Leia `src/lib/bevi/proposal-repo.ts:76`, `src/app/api/chat/route.ts:1011`,
     `src/lib/whatsapp/contract-capture.ts`, `src/lib/bevi/fecho-pedir-oi.ts:126`,
     `src/lib/mesa/handoff.ts`, `src/lib/whatsapp/workers/proposal-status-poll.ts:69-71` — a
     ligação stage+notificação **já existe**, não reimplemente.
   - TDD strict: escreva um teste de integração que simule o fluxo aceite→poll (aceite dispara
     `dispatchAutoTransbordo`; depois o poll roda com o lead em `na_administradora` e dispara
     de novo) e prove que existe **exatamente 1** handoff de mesa criado por lead — não 2.
   - Se o teste pegar duplicação real, corrija a idempotência em `mesa/handoff.ts` (ex.: checar
     handoff já aberto antes de criar outro). Se o teste passar de primeira (já é idempotente),
     ótimo — documente isso no `.done/` como "já estava correto, só faltava o teste de
     regressão provando".

5. Rode SÓ os testes dos arquivos que você tocou (`vitest run <path>`) — NUNCA a suíte inteira.
6. 1 commit Conventional (PT-BR) por item (`test+fix: nextGate nao reemite gate de
   qualificacao com proposta fechada`, `test: prova idempotencia da notificacao de mesa no
   aceite`).
7. Mova os fix-NN pra `docs/correcoes/done/` com `status: done` + `commit:` + `executado_em:`
   (best-effort).
8. Ao terminar: push da branch (`git push origin fix/resume-stage-mesa`) + gere
   `.done/{data}-bloco-h-resume-mesa.md`. NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart.
9. RESUMO FINAL: liste as decisões técnicas tomadas (ex.: qual campo de meta você usou pra
   `contractClosed`, se o FIX-365 já estava correto ou precisou de correção real).
