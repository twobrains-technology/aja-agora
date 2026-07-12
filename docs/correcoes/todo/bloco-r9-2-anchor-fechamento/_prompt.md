Você é o executor do bloco **bloco-r9-2-anchor-fechamento** no worktree isolado deste branch
(`fix/r9-2-anchor-fechamento`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR.
Package manager: **pnpm** (único PM permitido — nunca npm/yarn).

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-2-anchor-fechamento/` inteiro (`_bloco.md` +
   `fix-281-ancora-rawcreditvalue-real-offer.md` — root cause já provado file:line, correção
   já desenhada, não precisa re-investigar).

2. DESIGN: a correção já está fechada no card (não é decisão de produto/UX aberta) — PULE o
   brainstorming. Único ponto de julgamento técnico do executor: nome exato do campo novo
   (`originalRequestedCreditValue` é a sugestão do card; se encontrar um nome melhor/mais
   consistente com o resto do módulo ao ler o código, use — não precisa perguntar).

3. Execute o item ÚNICO **FIX-281**, TDD strict (teste de regressão PRIMEIRO, vê FALHAR, corrige,
   vê passar):
   - `src/lib/bevi/contract-input.test.ts`: novo caso provando que `buildStartContractInput`
     popula o campo novo a partir de `creditClampedFrom ?? creditMax` (NÃO de
     `recommendedOffer.creditValue`), com pedido e oferta DIVERGINDO.
   - `src/lib/bevi/fulfillment.test.ts`: novo caso ponta-a-ponta pinando os 2 números (pedido
     original × carta final) pros 2 cenários reais do veredito (mario: 70.000→71.043; madalena:
     250.000→263.864, `rawCreditValue` TEM que sair 250.000, nunca 260.173).
   - Implemente: `contract-input.ts` (novo campo em `buildStartContractInput`, SEM tocar no
     cálculo de `valor` existente) + `fulfillment.ts` (`StartContractInput`/`StartContractResult`
     + `startContract` usa o campo novo com fallback pro `valor` antigo quando ausente).
   - Rode a suíte completa (`pnpm test:unit`) e confirme que nada mais dependia do
     `requestedCreditValue == input.valor` antigo (grep antes: `grep -rn "requestedCreditValue"
     src/`).

4. **1 commit Conventional (PT-BR) por item** (aqui, 1 commit só: `test+fix: ancora rawCreditValue
   original no real_offer do fechamento (FIX-281)` ou similar).

5. Ao concluir: MOVA `fix-281-ancora-rawcreditvalue-real-offer.md` pra `docs/correcoes/done/`
   (`status: done` + `commit:` + `executado_em:`). Bloco esvaziou → apague a pasta
   `bloco-r9-2-anchor-fechamento/`.

6. Ao terminar: `pnpm test:unit` verde, **push da branch** (`git push origin
   fix/r9-2-anchor-fechamento`) + gere `.done/{data}-bloco-r9-2-anchor-fechamento.md` (resumo +
   testes + gaps honestos, ex.: se `real-offer.tsx`/o componente precisou de algum ajuste extra
   não previsto no card). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO
   crie reminder.** A integração na base é do orquestrador.

7. RESUMO FINAL: liste as decisões que você tomou (nome do campo, se ajustou algo além do
   previsto no card) — linha por decisão. Sem decisão nova? Diga isso.
