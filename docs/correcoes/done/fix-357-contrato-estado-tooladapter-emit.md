---
id: FIX-357
titulo: "Contrato: estado do grafo + adapter AI-SDK-tool→LangChain + mapeamento dos 14 TurnEvent"
status: done
bloco: bloco-fundacao-langgraph
arquivos:
  - src/lib/agent/langgraph/state.ts
  - src/lib/agent/langgraph/tool-adapter.ts
  - src/lib/agent/langgraph/emit.ts
rodada: 2026-07-20 — campanha runtime LangGraph, Rodada 0
commit: 7ce8b5e7
executado_em: 2026-07-20
---

## Cenário
O contrato de interface que a Rodada 1 (nós/cards/persistência) vai codar contra. Só tipos +
assinaturas + stubs que compilam; a implementação viva do skeleton é o FIX-358.

## Root cause (investigado — fix ALTA-4 + MÉDIA-7 do crítico)
- **Tools são objetos do Vercel AI SDK, não LangChain:** `ai-sdk.ts:9` `import { tool } from "ai"`;
  `buildConsorcioTools:1167` usa `tool({ inputSchema: z…, execute })`. `ToolNode`
  (`@langchain/langgraph/prebuilt`) espera `DynamicStructuredTool` do LangChain. `runDiscovery` é
  closure interno (`ai-sdk.ts:1373`), não exportado. → precisa de um adapter (não orçado antes).
- **O contrato de saída são 14 eventos** que `pipeOrchestratorToWriter` consome
  (`web/adapter.ts:278-426`): `text-delta, lead-collection-prompt, artifact, gate(+modelAsked),
  transition, welcome-categories, handoff, lead-stage, tool-call, suppression, usage, finish,
  meta-update, text-boundary`. `meta-update` carrega a projeção do `ConversationMetadata` (load-bearing
  p/ `gatePartData(gate, meta)` renderizar o card do gate). Contrato `TurnEvent` em `orchestrator/types.ts:19-60`.
- **Estado persistido:** `ConversationMetadata` (`personas.ts:73`) é a projeção que a UI/admin/mesa leem.

## Correção proposta
| O quê | Onde |
|---|---|
| `AgentGraphState`: `StateSchema`/`Annotation.Root` com `messages` (MessagesValue) + `funnel` (struct limpo dos campos coletados: name, desiredItem, motivation, creditValue, identity, offers, selectedOffer, lance*, flags de apresentação) + `intent` + `channel` | `state.ts` |
| `toLangChainTool(aiSdkTool): DynamicStructuredTool` — extrai `inputSchema` (zod) + `execute`, embrulha; helper `buildLangGraphTools(ctx)` que roda `buildConsorcioTools(ctx)` e mapeia todas | `tool-adapter.ts` |
| `projectToMeta(state): Partial<ConversationMetadata>` — projeção do estado do grafo pros campos que a superfície compartilhada consome (definir o CONJUNTO explícito: currentPersona, currentCategory, qualifyAnswers, identityCollected, revealCompleted, recommendedOffer, os flags `*Dispatched` usados por `gatePartData`/tool-policy) | `emit.ts` |
| `emitTurnEvents(...)`: assinaturas dos 14 `TurnEvent` (stubs) + doc de quais o runtime novo NÃO emite e por quê (ex.: `welcome-categories` pode ser N/A no meio da jornada) | `emit.ts` |
| `RuntimeAdapter` type: `(input: TurnInput) => AsyncGenerator<TurnEvent>` (o contrato que `runTurnLangGraph` cumpre) | `state.ts` ou `emit.ts` |

## Critério de aceitação
- Compila; os tipos batem com `TurnEvent`/`ConversationMetadata` reais.
- `tool-adapter` testado: 1 AI-SDK tool → `DynamicStructuredTool`, `.invoke()` executa o `execute` original.
- `projectToMeta` documenta o conjunto de campos (não "diff cego").

## Regressão exigida
Teste do round-trip do tool-adapter (1 tool) — invariante estrutural.
