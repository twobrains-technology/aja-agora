---
id: FIX-358
titulo: "Walking skeleton: grafo mínimo end-to-end + persistência-projeção"
status: todo
bloco: bloco-fundacao-langgraph
arquivos:
  - src/lib/agent/langgraph/graph.ts
  - src/lib/agent/langgraph/run-turn.ts
  - src/lib/agent/langgraph/nodes/
rodada: 2026-07-20 — campanha runtime LangGraph, Rodada 0
---

## Palavras do operador
"a jornada não está inteligente… ele está se perdendo na dinâmica" + "às vezes ele não encontra a
[tool] do momento… para buscar os grupos".

## Cenário
Com `AI_RUNTIME=langgraph`, um turno percorre o grafo e persiste no shape que a UI lê. Prova a troca
funcionando num slice REAL: name→desire→credit→identify→**discovery(nó)**→reveal→closing.

## Root cause (investigado)
- Greenfield. A "tool sumida" (crítico ALTA-2) é resolvida ESTRUTURALMENTE: a descoberta
  (`search_groups`/`recommend_groups`) hoje é discricionária do LLM (`ai-sdk.ts:1412`) e some quando
  cai fora da fase → `NoSuchToolError` → fallback (FIX-332). No grafo vira **nó determinístico**
  disparado por transição (identidade coletada + valor presente), nunca esquecível.
- `nextGate` (`qualify-state.ts:189-345`) é o esqueleto da ordem; `decideShowGate` (`:457`) decide o
  MOMENTO de mostrar card (não a fala). Reusar como guarda de rota, sem re-injetar copy.
- Analyzer alimenta `intent`/meta (`analyze.ts`/`turn-analyzer`) — nó `analyze` no início do turno (fix MÉDIA-10).

## Correção proposta (best practice — latitude do Kairo; honrar lei "não engessar")
| O quê | Onde |
|---|---|
| `runTurnLangGraph(input): AsyncGenerator<TurnEvent>` — carrega estado da conversa (reloadMeta→funnel), roda o grafo com `streamMode: ["messages","custom"]`, traduz tokens→`text-delta` e `config.writer(card)`→`artifact`, emite os demais TurnEvents, persiste (saveMessage + artifacts + persistMeta via projectToMeta + recordStageReached) | `run-turn.ts` |
| Nós: `analyze` (reusa turn-analyzer) → `route` (conditional edge, guarda por nextGate/decideShowGate, **aresta de escape em todo nó** — usuário sempre desvia) → `converse` (LLM fala, `bindTools` what-if, ToolNode loop; saída passa por `sanitizer`) → `discovery` (nó determinístico, `runDiscovery`) → `emitCard` (coerce*Payload + evaluateArtifactGuards + server-cards) → `persist` | `nodes/*.ts`, `graph.ts` |
| Ligar o dispatcher (FIX-355) ao `runTurnLangGraph` real | `orchestrator/index.ts` |
| Slice mínimo funcional: cobre até reveal + um clique de card (decision). O resto do funil = `TODO(rodada-1):` | — |

**NÃO ENGESSAR (inviolável):** o nó `converse` NUNCA tem frase fixa/`const` de fala — sempre o LLM.
O `route` decide SE/QUANDO mostrar card estruturado, o modelo decide O QUE falar. Sem regex travando copy.

## Critério de aceitação
- Teste de integração (modelo MOCKADO — sem gateway real): com `AI_RUNTIME=langgraph`, um turno
  percorre analyze→route→converse e persiste `messages`/`metadata`(projeção); `discovery` dispara quando
  identity+value prontos e emite o `artifact` de comparação; um clique de `decision` funciona sob a flag.
- 0 `NoSuchToolError` no slice.
- `AI_RUNTIME=vercel` segue idêntico; `pnpm build` + `pnpm test:unit` verdes.

## Regressão exigida
Teste de integração do skeleton (grafo + persistência + discovery-nó), modelo mockado. TDD strict no
invariante "discovery só dispara com identidade" (I1) e "0 NoSuchToolError". Sem travar copy por regex.
