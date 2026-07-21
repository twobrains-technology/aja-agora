Você é o executor do bloco `bloco-funil-completo-langgraph` no worktree isolado deste branch
(`feat/langgraph-runtime-funil-completo`). Idioma: PT-BR. Comunicação direta.

## Contexto (LEIA PRIMEIRO, nesta ordem)
1. `.processo/loop/2026-07-20-1948-langgraph-runtime.md` — o goal doc (arquitetura, corte, fronteira de
   reuso, rubrica, decisões do Kairo).
2. `.done/2026-07-20-bloco-fundacao-langgraph.md` — o que a Rodada 0 construiu + os `TODO(rodada-1)`
   explícitos (streaming, funil completo, guards, WhatsApp). É a sua lista de partida.
3. `docs/correcoes/README.md` + `docs/correcoes/todo/bloco-funil-completo-langgraph/` (os 4 cards FIX-359..362).
4. `CLAUDE.md` (seção "NÃO engesse o agente") — inviolável.
5. O código JÁ EXISTENTE do runtime em `src/lib/agent/langgraph/` (fundação integrada): `state.ts`,
   `provider.ts`, `tool-adapter.ts`, `emit.ts`, `graph.ts`, `run-turn.ts`, `nodes/*`. Você COMPLETA isso.

## O que você constrói
Completa o cérebro do runtime LangGraph sobre a fundação. Foco: uma **jornada web COMPLETA que roda**
com streaming ao vivo, todos os gates, todos os cards da coreografia, guards de invariante, e prova de
que o WhatsApp consome o mesmo stream. Ordem: FIX-359 (streaming) → 360 (funil completo) → 361 (cards+guards)
→ 362 (WhatsApp + invariantes + sondas).

## Arquitetura (mantida da fundação)
- **Reuso, não reescrita:** `nextGate`/`decideShowGate` (route), `analyzeAndMerge` (analyze),
  `coerce*Payload`+`evaluateArtifactGuards` (I3), `server-cards.ts` builders, `EphemeralTextFilter`
  (sanitizer I4/I5/D7), `recommendation.ts` (`respectsNetCreditGuardrail` D6), `buildConsorcioTools` via
  o `tool-adapter` já existente, persistência via `projectToMeta`.
- **Descoberta = NÓ determinístico** (não tool discricionária). What-if = tool-call do modelo via `ToolNode`.
- **Contrato de saída:** os 14 `TurnEvent`. Os channel adapters e o front ficam INTACTOS.
- **Streaming (FIX-359):** `graph.stream(..., { streamMode: ["custom","values"] })`. `text-delta`/`tool-call`/
  `artifact` saem AO VIVO via `config.writer`; `gate`/`meta-update` (que dependem de `reloadMeta` fresco)
  só saem do `values` FINAL, DEPOIS do nó `persist` — ordem garantida por topologia, nunca por timing.

## 🚨 NÃO ENGESSAR (inviolável)
- Nenhum nó tem fala fixa/`const` — o `converse` SEMPRE gera via `model.stream()`.
- Sem frase canônica, sem regex travando copy, sem directive "escreva 1 frase". As sondas de não-engessar
  (FIX-362) checam VARIAÇÃO/comportamento, jamais fixam texto exato.
- `route` decide SE/QUANDO mostrar card; o MODELO decide o que falar e pode desviar (aresta de escape em todo nó).
- Rapport (motivo/espelho) = transição de nó explícita, NÃO os flags frágeis do Vercel (`shouldAskMotive` etc.).

## Passos
1. Execute os itens NA ORDEM `FIX-359 → 360 → 361 → 362`. Cada card tem aceite próprio.
2. **TDD proporcional:** invariante/lógica (streaming ≥2 text-delta, sequência de gates, escape não trava,
   I3/I4/D6, byte-diff de "não entendi") → TDD strict. Wiring → teste estrutural. Modelo MOCKADO (streaming
   onde precisar) — sem gateway. **NÃO trave copy por regex.**
3. **Rode SÓ os testes que você tocou** (`vitest run <path>`), NUNCA a suíte inteira. **🚫 sem smoke de browser.**
   No fim: `pnpm test:unit` + `pnpm build` verdes (o erro de prerender de `/admin/personas/new` é falso-alarme ambiental conhecido).
4. 1 commit Conventional (PT-BR) por item. Mova cada fix-NN pra `docs/correcoes/done/` ao concluir.
5. Ao terminar: **push da branch** + `.done/{data}-bloco-funil-completo-langgraph.md` (resumo + decisões +
   testes + gaps `TODO(rodada-2)`). **NÃO abra PR, NÃO faça merge, NÃO deploy.** Tag-sentinela é injetada no footer.
6. RESUMO FINAL: decisões de design ("decidi X em vez de Y porque Z") — em especial como resolveu a ordem
   streaming×persistência e o rapport-como-nó.

## Se travar
- Priorize SEMPRE uma jornada que RODA + suíte verde sobre completude. Gap honesto marcado `TODO(rodada-2)` > algo quebrado.
- Streaming com ordem errada (card com dado stale): garanta que `gate`/`meta-update` saem só do estado final pós-persist.
- Não tente alcançar o gateway LiteLLM (bloqueado) — modelo mockado nos testes; o provider é isolado.
