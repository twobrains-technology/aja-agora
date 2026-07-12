Você é o executor do bloco `bloco-recomendacao-ancora` no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e `docs/correcoes/todo/bloco-recomendacao-ancora/`
   (`_bloco.md` + `fix-276-recomendacao-budget-inventado.md` — root cause CONFIRMADO, cenário,
   correção proposta, regressão exigida). Leia também `src/lib/agent/recommendation.ts` inteiro e
   o schema de `recommend_groups` em `src/lib/agent/tools/ai-sdk.ts`.

2. DESIGN (há decisão de design real — como ancorar a recomendação no valor pedido). Use
   `superpowers:brainstorming`. A abordagem **RECOMENDADA** é um **fator de proximidade de carta**
   no score: penalizar `|creditValue − creditMax| / creditMax` (carta ≈ valor pedido vence),
   adicionando o fator a `WEIGHTS` e rebalanceando (não deixe a soma dos pesos passar de 1;
   reduza um pouco os outros). Alternativa: derivar o `budget` server-side do valor do bem pedido
   (backstop determinístico no input da tool, padrão FIX-115/FIX-208) em vez de aceitar o que o
   LLM inventa. Se houver trade-off real entre as duas, **faça a pergunta via `AskUserQuestion`**
   (opção recomendada em 1º, rótulo "(Recomendado)") — o respondedor do Kairo responde; sem
   resposta em tempo razoável, siga a recomendada (fator de proximidade). Registre a decisão em
   `docs/decisoes/blocos/<data>-bloco-recomendacao-ancora.md` (o quê · opções · quem decidiu ·
   escolhida + porquê) + commit `docs:`.

   INVARIANTE do fix: a recomendada **nunca fica acima do valor do bem pedido** (`creditMax`) sem
   justificativa — dado um grupo com `creditValue` ≈ pedido na lista, ele deve vencer um grupo
   mais caro. NÃO invente budget; o valor âncora do cliente é o **valor do bem pedido**.

3. TDD strict (o projeto exige 3 camadas — CLAUDE.md):
   - **Camada 1 (structural):** `src/lib/agent/recommendation.<slug>.test.ts` — pedido
     `creditMax=120000` + [A creditValue 120000 parcela menor · B creditValue 150000 parcela maior]
     → recomendada = A. Teste FALHA antes do fix, passa depois. Cubra 80k e 250k também.
   - **Camada 2 (cassette):** trajetória do reveal (MockLanguageModelV2 em `tests/regression/`)
     provando que a recomendada não fica acima do valor pedido.
   Veja o teste falhar ANTES de implementar.

4. 1 commit Conventional (PT-BR) por peça lógica (test+fix: … / docs: …). Gate: `pnpm test:unit`.

5. Ao concluir: mova `fix-276-…` pra `docs/correcoes/done/` (status: done + commit: <hash> +
   executado_em: <data>); bloco esvaziou → apague a pasta `todo/bloco-recomendacao-ancora/`.

6. **push da branch** (`git push origin fix/recomendacao-ancora-valor-pedido`) + gere
   `.done/{data}-bloco-recomendacao-ancora.md` (resumo + decisão + testes + gaps).
   **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração é do
   orquestrador. A tag-sentinela de conclusão é injetada automaticamente no fim deste prompt.

7. RESUMO FINAL: liste as decisões de design que tomou ("decidi X em vez de Y porque Z" por linha).
