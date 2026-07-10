---
id: FIX-230
titulo: "Card novo: escassez (present_scarcity) — número placebo 1-6 estável por grupo"
status: done
bloco: bloco-cards-ui
arquivos:
  - src/lib/chat/types.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/tools/schemas.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/components/chat/artifacts/scarcity.tsx
  - src/components/chat/artifact-renderer.tsx
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR7/D4)
commit: b4b1cc9
executado_em: 2026-07-10
---

## Palavras do operador (decisão 2026-07-09, LITERAL)
> "implemente, esse número é só comercial placebo de venda, coloque um número de 1 a 6
> aleatório"

## Contexto / conflito resolvido (ver ADR docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md D3)
O handoff pedia "restam apenas N vagas" com dado REAL. Verificação: a Bevi NÃO entrega
vagas restantes — `offer-mapper.ts:132` mapeia `availableSlots = monthlyAwardedQuotas`
(contemplados/MÊS, não vagas). Kairo decidiu: o número é placebo comercial, 1-6. O
alerta de compliance (CDC art. 37) está registrado no ADR. Esta é decisão de produto
DELE — implementar.

## Correção proposta
| Ponto | Detalhe |
|---|---|
| Payload `ScarcityPayload` | `{ groupCode, administrator, availableSlots, disclaimer? }` |
| Número placebo | **estável por grupo**: `1 + (hashDeterministico(quotaId||groupId) mod 6)` → 1..6. NUNCA `Math.random()` a cada render (senão "restam 3" vira "restam 5" no refresh e destrói a credibilidade). |
| Tool `present_scarcity` + schema | `tools/ai-sdk.ts` + `tools/schemas.ts` |
| Coerção server-side | `runner.ts` — o número é derivado no servidor a partir do groupId (a LLM não escolhe o número) |
| Componente `scarcity.tsx` + case | `artifact-renderer.tsx` |
| Fase (reveal/closing, antes da proposta) | `tool-policy.ts` |

Copy: "Grupo quase cheio · restam apenas N. Quando preencher, entra fila para o próximo
grupo." Barra **decorativa** (largura fixa ~90%), NUNCA razão N/total (não temos total).

## Regressão exigida
- mesmo `quotaId` → mesmo número em renders repetidos (estabilidade — teste determinístico).
- número sempre em `[1,6]`.
- NUNCA exibe total de cotas nem razão numérica.
- barra é largura fixa (não deriva de N/total).

## Execução (2026-07-10)
- Payload usa `administradora` (PT), não `administrator` do exemplo literal do handoff
  — mesma normalização do FIX-229.
- Hash djb2 (`stableSlotFromId`) sobre o `groupId` REAL ancorado em `revealGroupsById` —
  sem grupo ancorado válido, `availableSlots` fica `undefined` e o componente (web e
  WhatsApp) não renderiza nada, em vez de estimar.
- **Achado**: os dois guards repo-wide de cobertura WhatsApp
  (`tests/regression/agent-trajectory.test.ts` e `src/lib/whatsapp/artifact-coverage.test.ts`)
  usam um mapa de payloads de amostra fixo — precisei adicionar entradas pra
  `embedded_bid`/`two_paths`/`scarcity` nos DOIS arquivos (o comentário do próprio teste já
  avisa "mantemos sincronizados").
- Commit: `b4b1cc9`.
