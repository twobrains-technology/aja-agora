---
id: FIX-196
titulo: "Hero fixo + seletor de cotas (Opção 1): tocar chip promove a cota e emite choose_offer"
status: todo
bloco: bloco-b-reveal-ui
arquivos:
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/comparison-table.tsx
  - src/components/chat/artifacts/contemplation-dial.tsx
  - src/lib/chat/provider.tsx
rodada: "2026-07-01 · onda reveal-refino · qa-dono-produto (carro web, conv fe2e8a09) + decisão Kairo Opção 1"
---

## Palavras do operador
"gostei desse card já com o simulador embutido... os outros cards menores, como podemos fazer ele virar o card maior dado que o usuário prefira outra cota?" → escolheu a Opção 1 (hero fixo + seletor).

## Cenário exato
No reveal, se o usuário prefere outra cota, não há caminho client-side pra promovê-la ao hero — ele digita texto livre e detona o loop do P0. Alvo: tocar um chip da cota → vira o hero, simulador recalcula no lugar; "Seguir com <cota>" vai ao contrato com o groupId real.

## Root cause investigado (spec hero-seletor + adendo B8)
Falta a interação de seleção client-side e a emissão de ação estruturada. O `comparison_table` é passivo; o `recommendation_card` é fixo no index 0.

## Correção proposta (CONTRATO com bloco-a)
| O quê | Onde |
|---|---|
| `selectedGroupId` como estado client; hero + `contemplation_dial` rebindam à cota selecionada | `recommendation-card.tsx`, `comparison-table.tsx` |
| `comparison_table` vira seletor (chips); tocar recalcula no lugar, sem novo turno, sem reflow | `comparison-table.tsx` |
| "Seguir com <cota>" emite `{kind:"choose_offer", groupId, ofertaId?}` (stub `TODO(bloco-a):` até merge) | `provider.tsx` |
| Ocultar linha de contemplação quando `availableSlots` ausente/0; nunca `taxaContemplacao` como % | `recommendation-card.tsx` |
| Respeitar selagem FIX-49 (só turno ativo interativo) | `recommendation-card.tsx` |

## Regressão exigida
- Camada 1: tocar chip muda `selectedGroupId` e rebinda o hero/dial; "Seguir" emite `choose_offer` com o groupId da selecionada; contemplação oculta quando availableSlots=0.
- E2E de tela (quando couber): tocar chip recalcula no lugar; "Seguir" avança ao contrato da cota escolhida sem re-disparar busca.
