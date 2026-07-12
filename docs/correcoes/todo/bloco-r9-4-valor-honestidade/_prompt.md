Você é o executor do bloco bloco-r9-4-valor-honestidade no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-4-valor-honestidade/` (`_bloco.md` + `fix-292-*.md` +
   `fix-293-*.md` — root cause, cenário, correção, regressão exigida) ANTES de tocar em qualquer
   código.

2. Ordem de execução DENTRO do bloco: **FIX-292 primeiro** (fonte única de `monthlyPayment` por
   groupId), **FIX-293 depois** (directive de justificativa reaproveita o dado consistente do
   FIX-292 quando cita parcela/score). Não há dependência de código real bloqueante, mas siga essa
   ordem — é a ordem lógica registrada na anotação.

3. ⚠️ Overlap nível 2 declarado no `_bloco.md`: `src/lib/agent/orchestrator/recommendation-payload.ts`
   × bloco-r9-4-reveal-serverside (você mexe em `coerceRevealCota` ~82-148 + possivelmente o TIPO
   de `knownCreditValueByGroupId`; o outro bloco mexe em `coerceComparisonPayload` ~236-259, que
   CHAMA `coerceRevealCota`). **O outro bloco (reveal-serverside) mergeia PRIMEIRO** — quando você
   for mergear, ajuste a assinatura/tipo que ele já integrou (o conflito é mecânico: mudança de
   tipo do Map de `number` pra `{creditValue, monthlyPayment}`, não lógica de negócio
   sobreposta).

4. DESIGN: ambos os cards (`fix-292`, `fix-293`) já trazem root cause + correção fechada
   (mudança de tipo/fonte única pro FIX-292; extensão de escopo de uma directive já existente pro
   FIX-293) — são bugs com fix definido, PULE o brainstorming a menos que a investigação do código
   revele um caminho melhor. Se houver trade-off real (ex.: como estender
   `isExactnessOrCriteriaQuestion` pro caminho normal sem quebrar o caminho de tool-error
   existente), use **`AskUserQuestion`** com opção recomendada em 1º, rótulo "(Recomendado)" —
   segue o respondedor; sem resposta, segue a recomendada. Registre em
   `docs/correcoes/decisions/<data>-bloco-r9-4-valor-honestidade.md`.

5. Execute FIX-292 depois FIX-293, NA ORDEM. TDD strict pra cada um: teste que reproduz o
   cenário exato do card ANTES do fix, veja FALHAR, corrija, veja passar.

6. 1 commit Conventional (PT-BR) por item — 2 commits neste bloco (um por FIX), mais o commit
   `docs:` do ADR se houver decisão registrada.

7. Ao concluir cada item: MOVA o respectivo `fix-NN-*.md` pra `docs/correcoes/done/` com
   `status: done` + `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou (os 2 itens feitos)
   → apague a pasta `docs/correcoes/todo/bloco-r9-4-valor-honestidade/`. (Best-effort —
   orquestrador garante via merge/reconcile.)

8. Ao terminar: `git push origin fix/r9-4-valor-honestidade` + gere
   `.done/{data}-bloco-r9-4-valor-honestidade.md` (resumo + decisões + testes + gaps). **NÃO abra
   PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração é do
   ORQUESTRADOR. A tag-sentinela é injetada automaticamente — só siga o footer.

9. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z" por
   linha) — em especial COMO você estendeu `isExactnessOrCriteriaQuestion` pro caminho normal
   (FIX-293) sem regredir o caminho de tool-error (FIX-282) já testado. Sem decisão real? Diga
   isso.
