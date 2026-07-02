---
id: FIX-108
titulo: "WhatsApp: escolha do grupo = card da recomendada + 'ver outras opções'"
status: done
bloco: bloco-whatsapp-apresentacao
arquivos:
  - src/lib/whatsapp/formatter.ts
  - src/lib/whatsapp/interactive-handlers.ts
rodada: 2026-06-28 — revisão da jornada de entrada (decisões Kairo)
commit: 7516144f
executado_em: 2026-06-29
---

## Resolução (2026-06-29)

- `recommendationToWhatsApp` (formatter): o card da recomendada ganhou um 3º
  botão **"Ver outras opções"** (`show_others`), preservando os CTAs de ação
  ("Tenho interesse!" + "Simular valores"). Cabe no limite de 3 botões do
  WhatsApp; títulos ≤ 20 chars.
- `interactive-handlers.ts`: `handleShowOthers` registra o clique
  (`recordUserClick`, histórico do lead) e conduz às alternativas via o texto
  canônico "Quero ver outras opções" — o MESMO caminho provado de
  `offer_reject`/`contract_cancel` (o agente re-apresenta o `comparison_table`
  com os grupos REAIS já no contexto, sem fabricar id).
- `comparison_table` segue mapeada (anti-drop preservado) — é o alvo do botão.
- **Dependência (nível 3):** o reveal ainda emite o `comparison_table` no mesmo
  turno; quando o `bloco-jornada-entrada` ajustar a sequência (recomendada
  primeiro, comparação só sob demanda), este botão vira a via única.
  Marcado `TODO(bloco-jornada-entrada)` no handler.
- Testes: `formatter.card-recomendada.test.ts`,
  `interactive-handlers.show-others.test.ts` (Camada 1) +
  `FIX-108-CARD-RECOMENDADA-VER-OUTRAS` em `agent-trajectory.test.ts` (Camada 2).

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
