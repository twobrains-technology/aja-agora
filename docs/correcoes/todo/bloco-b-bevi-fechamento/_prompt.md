Você é o executor do bloco **bloco-b-bevi-fechamento** no worktree isolado deste branch (`fix/bevi-fechamento-propostaid`). Trabalha SOZINHO, sem o Kairo para responder: NÃO faça perguntas, NÃO espere aprovação — você É o decisor (best practice + padrões do repo).

## Contexto
Achado da rodada de **QA manual do Kairo (2026-06-25)** na jornada de **fechamento de contrato** (`http://aja-develop.orb.local`, conv `a9c5effa`, administradora TRADIÇÃO). Este bloco é a **integração com a Bevi no fechamento** — um bug de INTEGRAÇÃO via adapter, NÃO de comportamento do agente.

## Passos
1. Leia `docs/correcoes/README.md` (regras do fluxo) e a pasta `docs/correcoes/todo/bloco-b-bevi-fechamento/` inteira: `_bloco.md` + `fix-79` (root cause investigado com arquivo:linha — a cadeia `startContract` → `simulate` → `propostaId` rejeitado com 400 de ownership; o SMOKING GUN: `createProposal` envia `productId` explícito mas `simulate` não). Leia também `CLAUDE.md` do projeto (regra de Migrations e regras de regressão) e o adapter pattern em `src/lib/adapters/bevi/`.

2. DESIGN: o `fix-79` já traz root cause fechado e a hipótese forte (mismatch de `BEVI_PRODUCT_ID` vs. conta do token). Para a escolha de implementação (enviar `productId` também no `simulate` vs. parametrizar `BEVI_PRODUCT_ID` vs. ambos), use o raciocínio da skill `superpowers:brainstorming` mas DECIDA sozinho — NÃO trave. Registre a decisão em `docs/correcoes/decisions/2026-06-25-bloco-b-bevi-fechamento.md`. Commit `docs:`.

3. **Regressão OBRIGATÓRIA — INTEGRATION TEST do adapter (NÃO cassette):** este é bug de integração via adapter, NÃO de agente — não exige Camada 2 (cassette de `agent-trajectory.test.ts`). Escreva ANTES do fix um **integration test do contrato do adapter Bevi**: `startContract` com proposta recém-criada deve `simulate` SEM 400 de ownership; mocke o gateway pra reproduzir `errors:[{ field:'propostaId', message:'Proposta não pertence ao Bevi Consórcio.' }]` e garanta que o fallback gracioso dispara. TDD strict: o teste FALHA primeiro (reproduz o 400 de ownership) → fix → verde.

4. **Fix de código + dependência externa:** deixe o código pronto pra enviar `productId` também no `simulate` (e/ou parametrize limpo o `BEVI_PRODUCT_ID`, hoje default hardcoded em `bevi-api-adapter.ts:60`). ⚠️ **A correção DEFINITIVA depende de dado EXTERNO da Bevi/AGX** (qual o `productId` correto do produto "Bevi Consórcio" da conta do `BEVI_API_TOKEN`). NÃO invente/chute o productId. Deixe a ação externa marcada como **PENDENTE-KAIRO** no `.done/` (acionar Bevi/AGX + setar `BEVI_PRODUCT_ID` explícito no env). Investigue também `ignoreOngoingProposals:true` (`fulfillment.ts:82`) como nota.

5. 1 commit Conventional (PT-BR) — `test+fix:` (integration test + correção no mesmo commit, teste primeiro). NÃO use `--no-verify`.

6. Ao concluir: MOVA o `fix-79` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta.

7. Ao terminar: **push da branch** (`git push origin fix/bevi-fechamento-propostaid`) + gere `.done/{data}-bloco-b-bevi-fechamento.md` (resumo + decisão + integration test + a dependência externa PENDENTE-KAIRO + gaps).

8. **PROIBIDO**: abrir PR, fazer merge, rodar deploy/restart, rodar migration na mão contra banco real, criar reminder, `--no-verify`. A integração na base é do ORQUESTRADOR; a revisão+merge é decisão do Kairo. Sua linha vermelha é só **push da branch**. A tag-sentinela é injetada automaticamente pelo `launch-blocks.sh` no fim deste prompt.

9. RESUMO FINAL: a decisão de design tomada + o que ficou PENDENTE-KAIRO (dado externo da Bevi).
