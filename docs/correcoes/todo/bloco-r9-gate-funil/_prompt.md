Você é o executor do bloco **bloco-r9-gate-funil** (rodada r9, loop de goal — jornada de
vendas de consórcio) no worktree isolado do branch `fix/r9-gate-funil`.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-gate-funil/` inteira (`_bloco.md` + `fix-279-...md` +
   `fix-280-...md` — cada um já traz root cause provado com file:line e correção proposta).

2. **FIX-279** já tem correção fechada (replicar o guard `activeGateAtTurnStart` que o
   FIX-236 aplicou pro `hasLance`, agora pro `creditMax`) — **PULE** brainstorming, é
   analogia direta de um padrão já existente no próprio arquivo (`analyze.ts:140`).

3. **FIX-280 TEM decisão de design real em aberto** (migrar `present_whatsapp_optin` pra
   emissão server-side determinística — RECOMENDADO — vs. tratar a inconsistência de timing
   como intencional/aceitável via ADR, sem mudar código). Use a skill
   `superpowers:brainstorming` só se quiser validar a abordagem; o trade-off real está: faça
   a pergunta via `AskUserQuestion` com a opção RECOMENDADA (migração server-side) em 1º
   lugar, rótulo terminando em "(Recomendado)". Sem resposta em tempo razoável, siga a
   recomendada — não trave. Registre a decisão em
   `docs/decisoes/blocos/2026-07-12-bloco-r9-gate-funil.md` (o que decidir · opções · quem
   decidiu · escolhida + porquê). Commit `docs:` desse ADR antes de implementar.

4. Execute NA ORDEM de `itens:` do `_bloco.md` (FIX-279 primeiro, depois FIX-280). **TDD
   strict**: teste de regressão FALHA antes do fix, PASSA depois.
   - **FIX-279**: teste cobrindo turno de `desire` com bem+valor juntos → `creditMax`
     permanece `undefined`, gate `credit` continua ativo no turno seguinte. Não regrida o
     caminho legítimo (resposta DIRETA ao gate `credit` continua setando o valor).
   - **FIX-280**: se migrar pra server-side, teste de integração com 2 conversas de `meta`
     idêntico confirmando emissão determinística nos dois; se optar pelo ADR sem mudança de
     código, não há regressão de código a escrever — documente isso no `.done/`.

5. **1 commit Conventional (PT-BR) por item.** Se FIX-280 gerar só o ADR (sem código), ainda
   assim registre isso claramente no commit/`.done/` — não invente um commit de código vazio.

6. Ao concluir cada item: mova o `fix-NN-....md` pra `docs/correcoes/done/`
   (`status: done` + `commit:` + `executado_em:`) — best-effort. Bloco vazio → apague a pasta.

7. Ao terminar: `pnpm test:unit` verde. **Push da branch**
   (`git push origin fix/r9-gate-funil`) + gere
   `.done/{data}-bloco-r9-gate-funil.md`. **NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart, NÃO crie reminder.** Integração na base é do orquestrador.

8. **Atenção a overlap textual (nível 2) em `system-prompt.ts`** com o bloco irmão
   `bloco-r9-compliance-copy` (roda em paralelo, branch `fix/r9-compliance-copy`): aquele
   bloco edita perto de "Valores monetários — NUNCA arredonde" (~585-596); se você migrar
   FIX-280 pra server-side, sua edição fica na seção `whatsappOptinSection` (~890-919) —
   região diferente do mesmo arquivo. Não deveria colidir linha-a-linha; se colidir mesmo
   assim, resolve-se mantendo as duas edições. **Ordem de merge recomendada:**
   `bloco-r9-compliance-copy` primeiro, `bloco-r9-gate-funil` depois (o segundo resolve o
   conflito trivial, se houver).

9. RESUMO FINAL: liste toda decisão tomada (a escolha do FIX-280 em especial, com o porquê) —
   "decidi X em vez de Y porque Z", uma linha por decisão.
