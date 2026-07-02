---
id: FIX-191
titulo: "Coagir o recommendation_card server-side (a LLM não digita mais número no hero)"
status: todo
bloco: bloco-a-reveal-dados
arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/directives.ts
rodada: "2026-07-01 · onda reveal-refino · qa-dono-produto (carro web, conv fe2e8a09) + refino spec"
---

## Palavras do operador
"o card ainda mostra número fabricado (36/mês)" · decisão do refino: "matar a fabricação com coerção server-side".

## Cenário exato
Reveal do carro (R$ 80k, conta Kairo). O hero (`recommendation_card`) exibiu "36 por mês", score 0,7237 e taxa adm 24,9% — números que a LLM emitiu, não coagidos do retorno real. Evidência: `docs/correcoes/inbox/_evidencia/passo5a-porque-recomendacao.png`.

## Root cause investigado (provado — ver spec §2, file:line)
`runner.ts` só coage `simulation_result` (`coerceSimulationPayload`) e `contemplation_dial` (`coerceDialPayload`); o `recommendation_card` é empurrado **as-is** (`artifacts.push({ type, payload })`, payload = args da LLM — `runner.ts:328-350`). `contempladosMes` é input livre da LLM (`ai-sdk.ts:142-148`) e `directives.ts:236` manda "copie de availableSlots". Viola Lei 3 (entidade não-ancorada) e Lei 4 (regra-no-prompt em vez de código).

## Correção proposta
| O quê | Onde |
|---|---|
| Coagir cada campo numérico do hero contra o `GroupSummary` real (parcela, valorCarta, prazo, availableSlots, score) no runner, igual `simulation_result` | `runner.ts` (novo `coerceRecommendationPayload`) |
| Remover `contempladosMes`/números do hero como input livre da LLM | `ai-sdk.ts:142` |
| Ajustar a diretiva pra não instruir "copie o número" (vira código, não prompt) | `directives.ts:236` |
| Emitir no payload os campos do CONTRATO (incl. `groupId`, `ofertaId`, `quotaId`) pra o bloco-b consumir | `runner.ts` |

## Regressão exigida (3 camadas)
- Camada 1: structural — dado args da LLM com `contempladosMes:36`, o payload final do card usa o valor coagido (não 36).
- Camada 2: **cassette** em `tests/regression/agent-trajectory.test.ts` — LLM emite hero com número inventado → card renderizado ignora e usa o real coagido (cenário de aceite §7.2 da spec).
