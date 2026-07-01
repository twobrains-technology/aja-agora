Você é o executor do bloco `bloco-whatsapp-funil-paridade` no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo), `docs/jornada/jornada-canonica.md` (o
   **Mapa de divergências** e as regras de paridade web↔WhatsApp — É A REGRA) e
   `docs/correcoes/todo/bloco-whatsapp-funil-paridade/` (_bloco.md + cada fix-NN: root cause,
   evidência `file:line`, correção e regressão exigida). O princípio: cada fix leva o WhatsApp
   à PARIDADE com o comportamento web que já foi corrigido — não invente UX nova, espelhe o web.

2. DESIGN: a maioria dos cards já traz root-cause + correção fechada (espelhar o web) — PULE o
   brainstorming neles. Exceção com decisão real = **FIX-120** (como coletar o valor do bem por
   conversa no WhatsApp): reusar `src/lib/agent/parse-asset-value.ts` (do FIX-115) é o caminho,
   mas se houver trade-off de UX, FAÇA a pergunta via `AskUserQuestion` (recomendada em 1º,
   rótulo terminando em "(Recomendado)"). Fallback anti-trava: sem resposta, siga a recomendada.
   Registre a decisão em `docs/correcoes/decisions/2026-07-01-bloco-whatsapp-funil-paridade.md`
   e commit `docs:`.

3. Execute os itens NA ORDEM de `itens:`. TDD strict. Bug de comportamento do agente/WhatsApp =
   **3 camadas** (Camada 1 structural + Camada 2 cassette em `tests/regression/agent-trajectory.test.ts`;
   Camada 3 nightly). O teste FALHA antes do fix, passa depois.

4. 1 commit Conventional (PT-BR) por item (`test+fix: <descrição>`).

5. Ao concluir cada item: MOVA o fix-NN pra `docs/correcoes/done/` (status: done + commit + executado_em).
   Bloco esvaziou → apague a pasta. (Best-effort — o orquestrador garante via merge/reconcile.)

6. Ao terminar: **push da branch** (`git push origin fix/whatsapp-funil-paridade`) + gere
   `.done/{data}-bloco-whatsapp-funil-paridade.md` (resumo + decisões + testes + gaps). **NÃO
   abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração na base
   é do ORQUESTRADOR. A tag-sentinela é injetada automaticamente pelo launch-blocks.sh.

7. RESUMO FINAL: liste as decisões de design ("decidi X em vez de Y porque Z"). Sem decisão? Diga.
