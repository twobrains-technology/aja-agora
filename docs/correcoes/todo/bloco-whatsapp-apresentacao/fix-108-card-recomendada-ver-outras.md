---
id: FIX-108
titulo: "WhatsApp: escolha do grupo = card da recomendada + 'ver outras opções'"
status: todo
bloco: bloco-whatsapp-apresentacao
arquivos:
  - src/lib/whatsapp/formatter.ts
  - src/lib/whatsapp/interactive-handlers.ts
rodada: 2026-06-28 — revisão da jornada de entrada (decisões Kairo)
---

## Palavras do operador
> (Q "Escolha do grupo") = **"Card da recomendada + ver outras (Recomendado)"**:
> destaca a melhor como card (com CTA "Tenho interesse"/"Simular") e oferece
> "Ver outras opções" pra abrir as alternativas.

## Cenário exato
No WhatsApp, a escolha entre as opções vira lista plana (`comparison_table` →
`comparisonTableToWhatsApp`, lista interativa de até 10). Perde o "essa aqui é a
melhor pra você". O Kairo quer a recomendada em DESTAQUE (card) + botão "Ver
outras opções" que abre as alternativas.

## Root cause investigado
- `src/lib/whatsapp/formatter.ts`: `comparisonTableToWhatsApp` renderiza a lista
  plana; `recommendationToWhatsApp`/`groupCardToWhatsApp` já fazem card com botões.
- `src/lib/whatsapp/interactive-handlers.ts`: handlers de clique; já existe o
  padrão "ver outras"/`offer_reject`/`show-other-options` no fluxo.

## Correção proposta
| O quê | Onde |
|---|---|
| No reveal, apresentar a recomendada como card (recommendation/group_card) com CTAs | formatter.ts |
| Botão "Ver outras opções" → abre a comparação (lista) das alternativas | formatter.ts + interactive-handlers.ts |
| Manter o guard anti-drop (nenhum artifact some) | formatter.ts |

DEPENDE do reveal do agente (bloco-jornada / já existente). Coordene se o shape
mudar (`TODO(bloco-jornada-entrada)`).

## Regressão exigida (3 camadas)
- Camada 1: formatter — reveal produz card da recomendada + botão "ver outras".
- Camada 2: cassette WhatsApp — reveal mostra recomendada em destaque; "ver outras" abre as alternativas.
