---
id: FIX-361
titulo: "Cards restantes + evaluateArtifactGuards + coerção completa (I3)"
status: todo
bloco: bloco-funil-completo-langgraph
arquivos:
  - src/lib/agent/langgraph/nodes/emit-card.ts
  - src/lib/agent/langgraph/nodes/discovery.ts
  - src/lib/agent/langgraph/emit.ts
rodada: 2026-07-20 — campanha runtime LangGraph, Rodada 1
---

## Cenário
Todos os cards da coreografia da jornada emitidos server-side coeridos, com o guard de artifact ativo.
A fundação só emitiu comparison_table/recommendation_card/decision_prompt.

## Root cause (investigado — TODO(rodada-1) da fundação)
- Faltam: `scarcity`, `two_paths`, `embedded_bid`, `whatsapp_optin`, `topic_picker`, `simulation_result`,
  `contract_form`, `real_offer`, `contemplation_dial` (os que fazem sentido no fluxo).
- `evaluateArtifactGuards` (`artifact-guard.ts`) NÃO integrado — a fundação cobriu só o 1º reveal (sem
  reentrância/ordem cruzada). É a 2ª linha que suprime card fora de fase.
- Coerção I3 (`coerce*Payload`, `recommendation-payload.ts`): a fundação reusa no discovery; estender aos demais.

## Correção proposta
| O quê | Onde |
|---|---|
| Emitir os cards restantes via os builders server-side existentes (`server-cards.ts`: `buildScarcityCard`, `buildTwoPathsCard`, `buildEmbeddedBidCard`, `buildWhatsappOptinCard`, `buildTopicPickerCard`) nos momentos certos do funil (disparo por transição de nó, NUNCA tool do LLM) | `emit-card.ts` |
| Passar TODA emissão por `coerce*Payload` + `evaluateArtifactGuards` antes do `config.writer` (I3 + supressão fora de fase) | `emit-card.ts`, `discovery.ts` |
| Escassez só com `availableSlots` real da Bevi (nunca inventar total do grupo); embutido sempre com "o crédito recebido diminui" | `emit-card.ts` |
| Cobrir os 22 tipos de card no mapeamento do `emit.ts` (o que emite vs N/A) | `emit.ts` |

## Critério de aceitação
- Teste: cada card emitido tem payload coerido (número nunca do modelo); card fora de fase é suprimido pelo guard.
- Escassez sem `availableSlots` real → card NÃO renderiza (não inventa).
- `pnpm test:unit` verde.

## Regressão exigida
Testes de invariante: I3 (payload coerido), guard suprime fora de fase, escassez só com dado real. Imgameáveis.
