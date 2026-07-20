Você é o executor do bloco `bloco-fundacao-langgraph` no worktree isolado deste branch
(`feat/langgraph-runtime-fundacao`). Idioma: PT-BR. Comunicação direta.

## Contexto (LEIA PRIMEIRO, nesta ordem)
1. `.processo/loop/2026-07-20-1948-langgraph-runtime.md` — o goal doc da campanha (arquitetura, corte,
   fronteira de reuso, rubrica, decisões do Kairo). É a fonte de verdade do desenho.
2. `docs/correcoes/README.md` — regras do fluxo de blocos.
3. `docs/correcoes/todo/bloco-fundacao-langgraph/` — o `_bloco.md` + os 4 cards FIX-355..358
   (root cause com file:line, correção, aceite).
4. `CLAUDE.md` (seção "NÃO engesse o agente") — a lei-mãe. Inviolável.

## O que você constrói
Um SEGUNDO runtime de IA em **LangGraph.js**, chaveável por `AI_RUNTIME=vercel|langgraph`, SEM
destruir o atual (Vercel AI SDK). Foco desta Rodada 0 = **walking skeleton que RODA** (a troca funciona
ponta-a-ponta num slice real: name→desire→credit→identify→discovery→reveal→closing) + o contrato de
interface que a Rodada 1 vai usar. NÃO é paridade completa — o que não couber vira `TODO(rodada-1):`.

## Arquitetura (crave isto — já criticado e fechado)
- **Corte:** `runTurn()` (`src/lib/agent/orchestrator/index.ts:296`) vira dispatcher por `AI_RUNTIME`.
  O corpo atual vira `runTurnVercel` (rename mecânico, comportamento idêntico). O novo é `runTurnLangGraph`.
  **Consistência por-conversa:** as chamadas recursivas `yield* runTurn` internas ficam no mesmo runtime
  (dentro de `runTurnVercel`, viram `yield* runTurnVercel`).
- **Provider (fix ALTA-3):** `ChatAnthropic` reusa `resolveGatewayHost` do `gateway-anthropic.ts` via
  `clientOptions.fetch` (gateway resolve host por SRV — NÃO base URL fixa). Replicar cache_control.
- **Tools (fix ALTA-4):** as tools de `buildConsorcioTools` (`tools/ai-sdk.ts`) são objetos do pacote
  `ai`, NÃO LangChain. Escreva um adapter `toLangChainTool` (AI-SDK → `DynamicStructuredTool`). Não reescreva as tools.
- **Descoberta = NÓ determinístico** (não tool discricionária) — dispara por transição (identidade+valor).
  Isto resolve estruturalmente a "tool sumida". What-if (simulate_quota, get_group_details, get_rates,
  compare_with_financing, check_proposal_status, suggest_handoff, save_contact_*) continua tool-call do modelo.
- **Reuso (NÃO reescrever):** `analyze.ts`/turn-analyzer (nó `analyze`), `nextGate`/`decideShowGate`
  (guarda de rota), `coerce*Payload` + `evaluateArtifactGuards` (I3), `server-cards.ts` (cards),
  `sanitizer.ts` (I4/I5/D7), `recommendation.ts` (D6), `persistMeta`/`saveMessage`/`artifacts`/`recordStageReached`.
- **Contrato de saída = os 14 `TurnEvent`** que `web/adapter.ts:278-426` consome (inclui `meta-update` com
  a projeção do `ConversationMetadata` — load-bearing). Emita-os; os channel adapters e o front ficam INTACTOS.
- **Estado do grafo:** struct LIMPO (não copie os flags de remendo tipo `gateStuckTurns`). Persiste via
  `projectToMeta` só nos campos que a UI/admin/mesa leem (defina o conjunto explícito).

## 🚨 NÃO ENGESSAR (inviolável — o agente já quebrou uma vez por isso)
- O nó `converse` NUNCA responde por texto pré-fabricado/`const` de fala — SEMPRE o LLM.
- Sem frase canônica obrigatória. Sem regex travando copy. Sem directive "escreva 1 frase e não chame tool".
- O `route` decide SE/QUANDO mostrar um card estruturado; o MODELO decide o que falar e pode desviar
  (aresta de escape em todo nó). Invariante verificável vira nó/guard; conversa é do modelo.

## Passos
1. Instale as deps no container: `pnpm add @langchain/langgraph@^1 @langchain/anthropic@^1 @langchain/core@^1`
   (peer zod ^4 é compatível). Se o pnpm reclamar de peer, resolva sem downgrade do zod.
2. Execute os itens NA ORDEM `FIX-355 → 356 → 357 → 358`. Cada um tem aceite próprio no card.
3. **TDD proporcional:** invariante/lógica (dispatcher por flag, discovery-só-com-identidade I1, tool-adapter
   round-trip, 0 NoSuchToolError) → TDD strict (teste falha antes). Wiring estrutural → teste estrutural.
   **NÃO trave copy por regex** (proibido). Modelo real não está disponível sem gateway → use **modelo
   MOCKADO** no teste de integração do skeleton; o spike de gateway (FIX-356) fica `skipIf(!reachable)`.
4. **Rode SÓ os testes dos arquivos que você tocou** (`vitest run <path>`), NUNCA a suíte inteira (é o gate
   da integradora). **🚫 NÃO rode smoke/QA de browser.** Rode `pnpm build` e `pnpm -s typecheck` no fim pra provar verde.
5. 1 commit Conventional (PT-BR) por item. Mova cada fix-NN pra `docs/correcoes/done/` ao concluir (best-effort).
6. Ao terminar: **push da branch**. Gere `.done/{data}-bloco-fundacao-langgraph.md` (resumo + decisões +
   testes + o que ficou `TODO(rodada-1)` + se o spike de gateway rodou ou ficou skipped). **NÃO abra PR, NÃO
   faça merge, NÃO rode deploy/restart.** A integração é do orquestrador; a tag-sentinela é injetada no footer.
7. RESUMO FINAL: liste as decisões de design ("decidi X em vez de Y porque Z") — em especial a resposta do
   spike (tool-calling nativo via LangChain no passthrough LiteLLM funcionou? senão, o que você fez).

## Se travar
- Deps LangChain conflitam com a stack (ai 6 / next 16 / zod 4): resolva sem quebrar o build do Vercel;
  se for impossível, PARE e documente no `.done/` (é decisão de fundação).
- Extração `runTurnVercel` de um generator recursivo de ~1394 linhas: faça rename mecânico + roteamento
  interno; se algum `yield* runTurn` tiver semântica ambígua, mantenha `runTurnVercel` e documente.
- Priorize SEMPRE um skeleton que RODA e a suíte verde sobre completude. Gap honesto > skeleton quebrado.
