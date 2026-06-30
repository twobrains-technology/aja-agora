---
id: FIX-107
titulo: "Web: trocar value_picker complexo por agulha/slider simples 1k em 1k (valor do bem)"
status: todo
bloco: bloco-web-valor-agulha
arquivos:
  - src/components/chat/artifacts/value-picker.tsx
  - src/components/chat/artifacts/plan-estimate-picker.tsx
  - src/components/chat/artifacts/gate-renderer.tsx
rodada: 2026-06-28 — revisão da jornada de entrada (decisões Kairo)
---

## Palavras do operador
> "na web temos que trocar por um de agulha simples de 1k em 1k - acho que ate ja temos"

## Cenário exato
Na web, o valor do bem é coletado pelo `value_picker` (3 sliders interligados
valor/parcela/prazo, com recálculo). O Kairo quer um slider SIMPLES de 1k em 1k
só pro valor do bem. Ele acha que o componente já existe.

## Root cause investigado
- `src/components/chat/artifacts/value-picker.tsx` = o componente complexo atual.
- `src/components/chat/artifacts/plan-estimate-picker.tsx` = CANDIDATO ao "já
  temos" (verificar se é um slider simples reaproveitável).
- `src/components/ui/slider.tsx` = slider shadcn base (step configurável).
- `gate-renderer.tsx` = renderiza os gates/artifacts de entrada.

## Correção proposta
| O quê | Onde |
|---|---|
| Slider simples de valor do bem, `step=1000`, formato currency | reusar `plan-estimate-picker.tsx` OU simplificar `value-picker.tsx` |
| Plugar no fluxo de valor da entrada | gate-renderer.tsx |
| Remover a complexidade interligada (parcela/prazo) da entrada | value-picker.tsx |

DEPENDE de FIX-104 (bloco-jornada): o agente coleta valor por conversa; a web
oferece o slider simples como apoio. Coordene o shape com `TODO(bloco-jornada-entrada)`.

## Regressão exigida
- Teste de componente: slider com `step=1000` renderiza e emite o valor escolhido.
- Se tocar a emissão/contrato do artifact: Camada 1 (structural).
