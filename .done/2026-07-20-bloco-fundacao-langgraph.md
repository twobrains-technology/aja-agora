---
bloco: bloco-fundacao-langgraph
branch: feat/langgraph-runtime-fundacao
campanha: .processo/loop/2026-07-20-1948-langgraph-runtime.md (Rodada 0)
itens: [FIX-355, FIX-356, FIX-357, FIX-358]
executado_em: 2026-07-20
commits:
  - 71b5358f (FIX-355)
  - 7ba16efa (FIX-356)
  - 7ce8b5e7 (FIX-357)
  - df57ed4d (FIX-358)
---

# Fundação do runtime LangGraph — walking skeleton (Rodada 0)

## Resumo

Segundo runtime de IA em LangGraph.js, chaveável por `AI_RUNTIME=vercel|langgraph`
(default `vercel`, comportamento idêntico ao de hoje), sem tocar no runtime Vercel AI SDK
existente. `runTurn()` (`orchestrator/index.ts`) virou um dispatcher fino; o corpo antigo foi
renomeado mecanicamente para `runTurnVercel` (zero mudança de comportamento comprovada por
`pnpm test:unit` 404/404 arquivos verdes).

O grafo mínimo (`analyze → route → converse → [discovery?] → emitCard → persist`) roda
ponta-a-ponta contra banco real: identidade+valor prontos disparam a descoberta
DETERMINISTICAMENTE (nunca dependendo do modelo "lembrar" de chamar uma tool — resolve a "tool
sumida" na raiz), emite os cards de comparação/recomendação, e um turno com o gate `decision`
pronto emite o card `decision_prompt` — tudo validado com testes de integração contra Postgres
real + fixture Bevi real (`fixtureDiscoveryAdapter`) + modelo mockado
(`FakeStreamingChatModel`, sem gateway).

## O que foi construído (por item)

### FIX-355 — flag + dispatcher + deps
- `src/lib/llm/runtime.ts`: `runtimeFlavor()` (`AI_RUNTIME`, trim+lowercase, default `vercel`).
- `orchestrator/index.ts`: `runTurn` (export) → `runTurnVercel` (rename mecânico) +
  `runTurnLangGraph` (import). Todos os 8 `yield* runTurn(...)` internos (inclusive dentro de
  `dispatchDecisionCascade`/`runTransitionAndContinue`) viraram `yield* runTurnVercel(...)` —
  consistência por-conversa garantida (nenhuma conversa Vercel mistura runtime).
- Deps instaladas: `@langchain/langgraph@1.4.8`, `@langchain/anthropic@1.5.1`,
  `@langchain/core@1.2.3` — **zero conflito de peer**, zod ^4 compatível sem downgrade.

### FIX-356 — provider + spike de gateway
- `src/lib/agent/langgraph/provider.ts`: `makeLangGraphModel()` reusa `gatewayFetch`
  (exportado de `gateway-anthropic.ts`, mesma resolução SRV dinâmica — nunca base URL fixa) como
  `clientOptions.fetch` do `ChatAnthropic`. `cacheableSystemBlock()` replica o breakpoint
  `cache_control` (1 breakpoint cobrindo o bloco estável — TODO rodada-1 granularidade fina).
- `provider.spike.test.ts`: prova tool-calling nativo via LangChain no passthrough LiteLLM —
  **status: SKIPPED nesta rodada** (ver seção Spike abaixo). `describe.skipIf` com probe HTTP
  real (não só TCP connect — achado ao vivo: socket "conectava" num túnel já morto).

### FIX-357 — contrato (estado, tool-adapter, 14 TurnEvent)
- `state.ts`: `AgentGraphState` (`Annotation.Root`) — `messages` (LangChain) + `funnel`
  (struct limpo do slice: persona/categoria/qualifyAnswers reduzido/identity/search/reveal/
  recommendedOffer/decisionDispatched) + `baseMeta` (snapshot completo do `ConversationMetadata`
  persistido, pra `projectToMeta` nunca apagar os ~80 campos fora do slice).
- `tool-adapter.ts`: `toLangChainTool`/`buildLangGraphTools` — embrulha as tools AI-SDK
  (`buildConsorcioTools`) em `DynamicStructuredTool`, delegando pro `execute` ORIGINAL. Zero
  reescrita de lógica de negócio.
- `emit.ts`: `projectToMeta` (conjunto EXPLÍCITO de campos, documentado — não diff cego) + os 14
  `TurnEvent` documentados (o que esta fundação emite vs. `TODO(rodada-1)`).

### FIX-358 — walking skeleton
- `graph.ts`: `buildAgentGraph({model?})` — injeção de dependência do modelo (testável sem
  gateway).
- `nodes/analyze.ts`: reusa `analyzeAndMerge` (turn-analyzer) tal-e-qual.
- `nodes/route.ts`: reusa `nextGate`/`decideShowGate`. `readyForDiscovery(funnel)` — predicado
  PURO do invariante **I1** (identidade+valor prontos, nunca antes), testado isolado (7 casos).
- `nodes/converse.ts`: o modelo SEMPRE fala via `model.stream()` — nunca `const`. Toolset
  what-if (`simulate_quota`, `get_group_details`, `get_rates`, `compare_with_financing`,
  `check_proposal_status`, `suggest_handoff`, `save_contact_name`, `save_contact_whatsapp`)
  bindado via `ToolNode`; `search_groups`/`recommend_groups` **nunca** entram nesse toolset —
  são o nó `discovery`, nunca discricionários. Sanitiza com `EphemeralTextFilter` (MESMA máquina
  I4/I5/D7 do runtime Vercel).
- `nodes/discovery.ts`: nó determinístico — chama `recommend_groups` via o tool-adapter, reusa
  `indexRevealGroups`/`buildComparisonTableFromRevealGroups`/`buildRecommendationCardFromRevealGroup`
  (mesma blindagem I3 contra número fabricado pela LLM). Idempotente (não rebusca com
  `searchDispatched=true`).
- `nodes/emit-card.ts`: evento `gate` + card `decision_prompt` (via `buildDecisionPromptCard`,
  mesma emissão server-side do `dispatchDecisionCascade` Vercel).
- `nodes/persist.ts`: `saveMessage`/artifacts/`persistMeta` (`projectToMeta`) — sempre o ÚLTIMO
  nó.
- `run-turn.ts`: `runTurnLangGraph` real (substituiu o stub do FIX-355).

## Decisões de design (X em vez de Y, porque Z)

1. **`graph.invoke()` em vez de `graph.stream()` nesta fundação.** O card previa
   `streamMode: ["messages","custom"]`. Ao implementar descobri um bug de ORDEM: o adapter web
   (`web/adapter.ts:308`) faz `reloadMeta(conversationId)` **fresco do banco** no handler do
   evento `"gate"` — se esse evento saísse ao vivo (via `config.writer`) ANTES do nó `persist`
   gravar, o card renderizaria com dado stale. Decidi **não** correr atrás de misturar
   `streamMode: ["custom","values"]` sob pressão de tempo: os nós já emitem `text-delta`/
   `tool-call` via `config.writer` (sem dependência de leitura fresca — infra pronta pra ligar
   streaming ao vivo depois); os demais 12 tipos de evento (`gate`/`artifact`/`meta-update`/etc.)
   só são drenados do ESTADO FINAL do grafo, depois que `persist` já rodou — ordem garantida por
   TOPOLOGIA, não por timing. **Trade-off honesto: esta fundação NÃO faz streaming de token ao
   vivo pro usuário** (o turno inteiro roda e persiste antes de qualquer evento sair) —
   `TODO(rodada-1)`: trocar `invoke` por `stream(..., {streamMode:["custom","values"]})` sem
   tocar nos nós.
2. **`ToolNode` (prebuilt) em vez de invocar tools manualmente no loop do `converse`.** Decidi
   isso DEPOIS de descobrir que `ToolNode` já resolve "0 NoSuchToolError" de graça — tool
   desconhecida vira `ToolMessage({status:"error", content:"... not found ..."})`, nunca lança.
   Testado (`converse.test.ts`): um tool_call hallucinado pra `search_groups` (fora do toolset
   bindado de propósito) não derruba o turno.
3. **System prompt: `SYSTEM_PROMPT` (system-prompt.ts) MENOS a seção "Fluxo de Vendas".** Reusa
   a MESMA fonte de compliance (tom, regras de ouro, dados financeiros, what-if, o que não
   fazer) via split de string na seção, em vez de reescrever do zero. `TODO(rodada-1)`:
   `buildSpecialistPrompt`/`buildConciergePrompt` completos (exemplos por persona, identidade da
   persona DB) — esta fundação usa o prompt base genérico.
4. **`discovery` chama `recommend_groups` direto (não `search_groups`+`recommend_groups`).**
   Simplificação deliberada pro slice mínimo — `recommend_groups` já devolve ranking, suficiente
   pra montar hero + comparativo. `TODO(rodada-1)`: replicar a lógica de reaproveitamento
   search→recommend do runner Vercel (FIX-289) se o custo de round-trip à Bevi importar.
5. **`lead-stage` como proxy determinístico** (engajado após `desireAsked`, qualificado após
   `identityCollected`) em vez de réplica fiel de `LEAD_STAGE_BY_TOOL` (runner.ts, disparado por
   tool específica). `recordStageReached` é forward-only+idempotente (adapters intactos) —
   reemitir a cada turno é seguro. `TODO(rodada-1)`: paridade fina.
6. **`evaluateArtifactGuards` (artifact-guard.ts) NÃO integrado** no nó `discovery`/`emitCard`
   nesta rodada — o slice cobre só o primeiro reveal (sem reentrância/ordem cruzada com outros
   artifacts do turno, que é onde os guards importam). `TODO(rodada-1)` explícito no código.
7. **Testes seedam o `ConversationMetadata` direto no banco** (mesmo padrão de
   `index.fix-246-server-cards.integration.test.ts`, `POS_REVEAL_META`) em vez de simular os
   gates intermediários (`experience`/`reco-consent`/`timeframe`/`lance`/`simulator-offer`) turno
   a turno — esses nós são Rodada 1 (ITEM D do goal doc), fora de escopo desta fundação.

## Spike de gateway (ITEM 0A) — status: SKIPPED, tentativa ao vivo documentada

Tentei validar de verdade (não só documentar o skip): reabri o túnel SSM pro LiteLLM shared.
A instância EC2 registrada na memória do projeto (`i-08d456699dab4222c`) estava **stale** — a
task `litellm-shared` foi reagendada; redescobri a atual (`i-0df4df1e4cd6fd84d`) via
`aws ecs describe-tasks`/`describe-container-instances`. Também descobri que o `hostPort` real
**não é fixo em 4000** (bridge mode, porta dinâmica — hoje `32768`), diferente do que a memória
antiga assumia.

Com instância e porta corretas, o túnel abriu ("Port 4000 opened... Waiting for connections"),
mas **toda requisição HTTP falhou** com `"Connection to destination port failed, check SSM Agent
logs"` — o SSM Agent na própria instância não conseguiu alcançar `localhost:<hostPort>`
localmente (não é firewall/security group, é loopback dentro do host). Não investiguei a fundo
(fora do escopo deste bloco de fundação) — **PENDENTE-KAIRO**, documentado com o comando de
redescoberta em `~/.claude/.../memory/project_aja_llm_local_via_tunel_ssm.md` (memória
atualizada nesta sessão).

O `provider.spike.test.ts` tem um probe de alcançabilidade real (HTTP, timeout 3s — não só TCP
connect, que deu falso positivo com um socket zumbi depois de eu matar a sessão SSM) e fica
`describe.skipIf(!reachable)` — roda automaticamente e PASSA assim que o gateway estiver de pé
(sem precisar tocar o teste).

## Testes

- `src/lib/agent/orchestrator/index.fix-355-dispatcher-flag.test.ts` — 4 testes (roteamento por
  flag, trim+lowercase, `vercel` nunca toca `runTurnLangGraph`).
- `src/lib/agent/langgraph/provider.spike.test.ts` — 1 rodando (skip documentado) + 1 skipped.
- `src/lib/agent/langgraph/tool-adapter.test.ts` — 4 testes (round-trip AI-SDK→LangChain).
- `src/lib/agent/langgraph/emit.test.ts` — 4 testes (`projectToMeta` conjunto explícito, nunca
  apaga campo fora do slice).
- `src/lib/agent/langgraph/nodes/route.test.ts` — 7 testes (matriz completa do invariante I1).
- `src/lib/agent/langgraph/nodes/converse.test.ts` — 4 testes (nunca fala hardcoded + tool
  hallucination graciosa).
- `src/lib/agent/langgraph/run-turn.integration.test.ts` — 4 testes, DB real + fixture Bevi +
  modelo mockado (I1 no grafo, discovery dispara e persiste, idempotência, `decision_prompt`).

**Total: 28 testes novos, todos verdes.** `pnpm test:unit` (404/404 arquivos, Vercel intacto) e
`pnpm build` (✓ Compiled successfully, 0 `error TS`) verdes — o erro de prerender de
`/admin/personas/new` no build é o falso-alarme ambiental já documentado (container dev,
`useContext null`), não relacionado a este bloco.

## TODO(rodada-1) — gaps honestos desta fundação

- Streaming de token ao vivo pro usuário (`graph.invoke()` → `graph.stream()`).
- Nós de funil completos (`rapport`/`experience`/`timeframe`/`lance*`/`simulator-offer` — ITEM D
  do goal doc) — hoje só `name→desire→credit→identify→discovery→reveal→decision`.
- `evaluateArtifactGuards` integrado nos nós de card.
- `modelAsked` real no evento `gate` (hoje sempre `false` — seguro, só não-otimizado).
- Paridade fina de `lead-stage` com `LEAD_STAGE_BY_TOOL`.
- `buildSpecialistPrompt`/`buildConciergePrompt` completos (exemplos por persona).
- Cards restantes (scarcity, two_paths, contract_form, whatsapp_optin, etc. — ITEM E).
- Fiação WhatsApp validada ponta-a-ponta (só web foi exercitado nos testes desta rodada — o
  contrato de `TurnEvent` é o mesmo, então `whatsapp/adapter.ts` deveria consumir sem mudança,
  mas não há teste de integração cobrindo isso ainda).
- Resolver o bloqueio do SSM Agent (spike de gateway) e rodar o spike ao vivo.

## Próximo passo

Rodada 1 (paralelizável contra o contrato do FIX-357): ITEM D (nós de funil completos), ITEM E
(cards + guards), ITEM F (persistência-projeção completa + WhatsApp), ITEM G (testes de
invariante I3/I4/D6 + sondas de não-engessar).
