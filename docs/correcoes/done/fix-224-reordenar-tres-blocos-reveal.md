---
id: FIX-224
titulo: "Reordenar os 3 blocos do reveal + consolidar a info de lance dentro do card"
status: done
severidade: media
projeto: aja-agora
arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/system-prompt.ts
bloco: bloco-cards-recomendacao
rodada: 2026-07-04 — Ata de alinhamento com o cliente (item 4.2, P1)
commit: 066c654
executado_em: 2026-07-04
---
## Palavras do operador
> Ata 4.2: *"Reordenar a sequência dos 3 blocos (recomendado / demais cards / simulação-lance estimado) — hoje está confusa. Avaliar consolidar a info do lance dentro do próprio card."*

## Cenário exato
- No reveal, hoje saem 3 artifacts em sequência: `recommendation_card` → `comparison_table` → `simulation_result`. A ordem/quebra confunde.

## Esperado × Atual
- **Esperado:** sequência clara; a info de lance/simulação **consolidada dentro do card**, não como um 3º bloco solto e confuso.
- **Atual:** ordem fixa `recommendation_card → comparison_table → simulation_result` (`directives.ts:264`), com o lance estimado num bloco separado.

## Root cause (INVESTIGADO)
- Ordem literal em `directives.ts:264`; regra "inseparáveis" `recommendation_card`+`comparison_table` em `directives.ts:266`; instrução completa do reveal `directives.ts:240-266`.
- Espelho no prompt: `system-prompt.ts:580-590`.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Reordenar a sequência dos 3 blocos pra ficar clara (menos fragmentação) | `directives.ts:264,240-266` |
| Consolidar a info de lance/simulação **dentro do card** (junto com a parcela antes/depois de FIX-221) em vez de um 3º bloco solto | `directives.ts`, `recommendation-card.tsx` (via FIX-221) |
| Atualizar o espelho no prompt | `system-prompt.ts:580-590` |

⚠️ **Decisão de UX real** — a Ata diz "avaliar" a ordem/consolidação. O executor decide a ordem final via `superpowers:brainstorming` (com `AskUserQuestion`, recomendada em 1º; fallback: siga a recomendada) e registra no ADR do bloco. Acoplado a FIX-221 (parcela no card) — executar DEPOIS de FIX-221.

## Regressão exigida (TDD strict)
1. Teste da **nova ordem** de emissão dos artifacts do reveal.
2. Teste que a info de lance/parcela aparece **dentro do card** (consolidada), não só num bloco separado.

## Implementação (2026-07-04)

- **Decisão de UX** tomada via `superpowers:brainstorming` + `AskUserQuestion` (3 opções, recomendada em 1º) — Kairo escolheu a recomendada. ADR completo (contexto · opções · escolhida + porquê) em
  [`docs/decisoes/blocos/2026-07-04-bloco-cards-recomendacao.md`](../../decisoes/blocos/2026-07-04-bloco-cards-recomendacao.md).
- **Ordem final**: `recommendation_card` (opção completa) → `simulation_result` (aprofunda: cenário com lance, correção) → `comparison_table` (convite pra comparar, por último — mesmo peso, FIX-220). `directives.ts` (passos 3-5 renumerados + linha "A ORDEM dos cards") e `system-prompt.ts` ("Sequência correta da apresentação") atualizados em sintonia.
- **Consolidação de lance no card**: já satisfeita pelo FIX-221 (parcela antes/depois + enunciado "recebe menos" dentro do `recommendation_card`) — este item não precisou de trabalho adicional além da reordenação.
- **Regra de compliance preservada**: Bv2-07 (CMN 4.927/2021 — `simulate_quota`+`present_simulation_result` sempre encadeado após o card) e a inseparabilidade `recommendation_card`↔`comparison_table` (FIX-78) continuam intactas — só a POSIÇÃO de `comparison_table` mudou.
- Regressão: `directives.fix-224.test.ts` (nova ordem no texto da diretiva + "A ORDEM dos cards" + FIX-78 intacto); item 2 coberto por `recommendation-card.fix-221.test.tsx`.
