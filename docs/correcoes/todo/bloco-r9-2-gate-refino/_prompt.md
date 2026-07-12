Você é o executor do bloco **bloco-r9-2-gate-refino** no worktree isolado deste branch
(`fix/r9-2-gate-refino`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR. Package
manager: **pnpm** (único PM permitido — nunca npm/yarn).

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-2-gate-refino/` inteiro (`_bloco.md` +
   `fix-285-gate-motivo-depende-de-item-especifico.md` +
   `fix-284-gate-credit-confirma-valor-do-desire.md` — root cause já provado file:line em cada
   card, com o rastro completo do dossiê e do prompt do `turn-analyzer.ts` que confirmou o
   mecanismo real).

2. DESIGN: as duas correções já estão fechadas nos cards (não são decisões de produto/UX
   abertas) — PULE o brainstorming. Único ponto de julgamento técnico do executor: nome exato
   dos campos novos (`desireAnswered`, `creditMentionedAtDesire` são as sugestões dos cards; se
   encontrar nomes melhores/mais consistentes com o resto do módulo ao ler o código, use — não
   precisa perguntar).

3. Execute NA ORDEM: **FIX-285** primeiro, depois **FIX-284**. TDD strict pros dois (teste de
   regressão que reproduz o cenário exato do dossiê PRIMEIRO, vê FALHAR, corrige, vê passar):
   - FIX-285: novo `qualify-state.fix-285-motivo-item-generico.test.ts` (mesmo padrão de
     `qualify-state.fix-274-sem-consent.test.ts`) — `shouldAskMotive` com `desireAnswered:
     true` e `desiredItem: undefined` tem que retornar `true` (hoje retorna `false`). Implemente:
     campo `meta.desireAnswered` (marcado em `analyze.ts`, mesmo padrão do guard
     `activeGateAtTurnStart` já usado pra `creditMax`/`hasLance`) + troca da precondição em
     `shouldAskMotive` (`qualify-state.ts:191-194`) + ajuste em `desireFollowUpSection`
     (`system-prompt.ts:1019-1027`) pra variante sem citar item quando `desiredItem` for null.
     CONFIRME que o watchdog FIX-275 (`qualify-state.ts:248-258`) e a mirror do motivo
     (`motivationMirrorSection`) continuam passando — não regredir.
   - FIX-284: novo teste em `analyze.test.ts` (captura do valor mencionado no `desire`, SEM
     popular `q.creditMax` — não regredir o FIX-279/G3) + novo
     `gate-questions.fix-284-confirma-desire.test.ts` (mesmo padrão de
     `gate-questions.fix-268-reserva.test.ts`) — `gateQuestion("credit", ...)` com valor
     mencionado devolve copy de confirmação; sem valor,
     devolve o texto atual). Implemente: campo `q.creditMentionedAtDesire` em `personas.ts` +
     captura oportunista em `analyze.ts` (sem gating por `activeGateAtTurnStart` — nunca
     substitui a agulha formal) + nova assinatura de `gateQuestion("credit", ...)` +ajuste dos
     call-sites (`whatsapp/adapter.ts`, `gate-reengage.ts`, o equivalente web — `grep -rn
     "gateQuestion(" src/` antes de mexer, pra não esquecer nenhum).

4. **1 commit Conventional (PT-BR) por item** (`test+fix:` cada um).

5. Ao concluir cada item: MOVA o `fix-NN` correspondente pra `docs/correcoes/done/` (`status:
   done` + `commit:` + `executado_em:`). Bloco esvaziou → apague a pasta
   `bloco-r9-2-gate-refino/`.

6. Ao terminar: `pnpm test:unit` verde, **push da branch** (`git push origin
   fix/r9-2-gate-refino`) + gere `.done/{data}-bloco-r9-2-gate-refino.md` (resumo + testes + gaps
   honestos, ex.: algum call-site de `gateQuestion` que precisou de ajuste extra não previsto).
   **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO crie reminder.**

7. RESUMO FINAL: liste as decisões que você tomou (nomes de campo, call-sites ajustados) — linha
   por decisão. Sem decisão nova? Diga isso.
