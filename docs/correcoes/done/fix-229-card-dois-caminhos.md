---
id: FIX-229
titulo: "Card novo: dois caminhos, sem lance (present_two_paths)"
status: todo
bloco: bloco-cards-ui
arquivos:
  - src/lib/chat/types.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/tools/schemas.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/components/chat/artifacts/two-paths.tsx
  - src/components/chat/artifacts/artifact-renderer.tsx
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR6/D5)
---

## Palavras do operador (handoff)
> "Card A/B pra quem NÃO vai dar lance: (A) esperar sorteio, (B) lance pequeno opcional.
> Devolve a decisão ao cliente. O agente NÃO recomenda um dos dois. Proibido: qualquer
> métrica de chance/probabilidade de contemplação no card." — `docs/02`, `docs/05`

## Root cause / estado atual
O mais próximo é `decision-prompt.tsx` (3 opções) ou `scenarios.tsx` — nenhum é a
bifurcação A/B "sem lance". Pode nascer como componente novo OU variant de decision-prompt.

## Correção proposta
| Ponto | Detalhe |
|---|---|
| Payload `TwoPathsPayload` | `{ monthlyPayment, administrator, disclaimer }` — `chat/types.ts` |
| Tool `present_two_paths` + schema | `tools/ai-sdk.ts` + `tools/schemas.ts` |
| Coerção server-side | `runner.ts` — `monthlyPayment` vem do grupo escolhido |
| Componente `two-paths.tsx` (ou variant de decision-prompt) + case | `artifact-renderer.tsx` |
| Fase (reveal/closing) | `tool-policy.ts` |

Conteúdo: (A) Esperar o sorteio — paga só a parcela e concorre todo mês, sem custo extra
("ideal pra quem não tem pressa"). (B) Um lance pequeno lá na frente — se sobrar um extra
(13º, férias), melhora as chances ("opcional, quando fizer sentido"). NENHUMA % de chance.

## Ligação com o funil (nível 3 — bloco-jornada)
O gate `lance`, na 3ª saída "só a parcela", é quem faz o agente chamar `present_two_paths`.
A criação da tool é AQUI; o gate que a dispara é do bloco-jornada-conversa.

## Regressão exigida
- payload/render NÃO contém nenhuma métrica de probabilidade/chance (teste-guard).
- o card apresenta exatamente 2 caminhos, sem destacar/recomendar um.
