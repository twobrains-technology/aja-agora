Você é o executor do bloco **bloco-h-jornada-auto-fidelidade** no worktree isolado deste branch (`fix/jornada-auto-fidelidade`). Projeto: aja-agora (consórcio AI-first). Domínio: TwoBrains.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e `docs/correcoes/todo/bloco-h-jornada-auto-fidelidade/` (`_bloco.md` + os 3 fix-NN — cada um traz root cause PROVADO, cenário, correção proposta e regressão exigida). Leia também `CLAUDE.md` (regra de regressão em 3 camadas) e `docs/jornada/jornada-canonica.md` (a jornada é REGRA).

2. **Sem fase de design/brainstorming** — os 3 fix-NN já trazem root cause investigado + correção fechada, e a decisão de produto do FIX-73 já foi tomada pelo Kairo ("recomendar a cota real": recomendação/simulador exibem a MESMA cota contratável; número recomendado = número contratado). Se durante a implementação do FIX-73 aparecer um trade-off REAL não previsto (ex.: como persistir a oferta selecionada entre descoberta e fechamento), decida pela opção mais simples e coerente com a decisão já tomada, registre em `docs/correcoes/decisions/2026-07-02-bloco-h.md` (commit `docs:`) e siga — NÃO trave.

3. Execute os itens NA ORDEM `[FIX-73, FIX-74, FIX-75]`. **TDD strict pra cada um**: escreva o teste de regressão PRIMEIRO (na camada que o card exige), veja FALHAR, implemente o fix, veja PASSAR.
   - **FIX-73** (recomendação coerente): crie `coerceRecommendationPayload` (espelhe `coerceSimulationPayload`), plugue no branch `recommendation_card` do `runner.ts`, e faça o fechamento reusar a oferta real da descoberta (`meta.recommendedOffer`/snapshot) em vez de re-derivar de `q.creditMax` em `contract-input.ts`/`route.ts`. Regressão: Camada 1 (structural) + Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`) + esqueleto Camada 3 se aplicável.
   - **FIX-74** (timeframe): guarda determinística em `analyze.ts` que rejeita `prazoMeses` quando a mensagem só traz orçamento/parcela mensal sem menção temporal. Regressão: Camada 1 (unit do guard) + Camada 2 (cassette: turno valor+orçamento → `nextGate` emite `timeframe`).
   - **FIX-75** (chip): em `src/components/landing/hero.tsx`, o handler do chip deve preservar/compôr o texto digitado (texto do usuário vence; canned só com textbox vazio). Regressão: **só Camada 1** (componente não-agêntico) em `copy.test.ts`/`hero.test.tsx`.

4. **1 commit Conventional (PT-BR) por item** — `test+fix:` (imperativo minúsculo, sem ponto final). Cassettes em `agent-trajectory.test.ts` são **append** (reconstrução determinística, nunca union/sobrescrever cassettes existentes).

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: 2026-07-02`. (Best-effort — o orquestrador garante via merge-wave; não trave se esquecer.)

6. **Gate antes de encerrar:** rode `pnpm test:unit` (gate do projeto — NÃO typecheck whole-repo, que já é vermelho por dívida em test files) e deixe VERDE. Depois: **push da branch** (`git push origin fix/jornada-auto-fidelidade`) + gere `.done/{data}-bloco-h-jornada-auto-fidelidade.md` (resumo de negócio + decisões + testes + gaps). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração na base é do orquestrador; a tag-sentinela de conclusão é injetada automaticamente no fim deste prompt.

7. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z" por linha). Sem decisão? Diga isso.
