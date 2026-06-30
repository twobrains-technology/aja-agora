---
id: FIX-109
titulo: "WhatsApp: apresentar o simulador conversacional + parar a lista de faixas de valor"
status: todo
bloco: bloco-whatsapp-apresentacao
arquivos:
  - src/lib/whatsapp/formatter.ts
  - src/lib/whatsapp/adapter.ts
rodada: 2026-06-28 — revisão da jornada de entrada (decisões Kairo)
---

## Palavras do operador
> (Q "Simulador") = **"Loop conversacional"**.
> "usuario so vai falar o valor agora ... nao tem mais aquele componente
> complexo sobre o valor bem".

## Cenário exato
No WhatsApp: (a) o simulador é texto estático (`contemplationDialToWhatsApp`,
marcos fixos 3/6/12/24) — agora é loop conversacional (o agente conduz —
FIX-106; aqui a apresentação do cenário recalculado a cada iteração); (b) o
`value_picker` virava lista de faixas (`valuePickerToWhatsApp`) — como o valor
agora é conversa (FIX-104), não mandar mais a lista.

## Root cause investigado
- `src/lib/whatsapp/formatter.ts`: `contemplationDialToWhatsApp` (texto estático),
  `valuePickerToWhatsApp` (lista de faixas).
- `src/lib/whatsapp/adapter.ts`: `consumeEvents` roteia artifacts → formatter; é
  onde o value_picker deixaria de ser emitido (contrato do bloco-jornada).

## Correção proposta
| O quê | Onde |
|---|---|
| Apresentar cada iteração do simulador conversacional (cenário recalculado: parcela até/após, lance, crédito) em texto natural | formatter.ts |
| Parar de renderizar a lista de faixas de valor (valor é conversa agora) | formatter.ts / adapter.ts |
| Não recalcular no WhatsApp — só formatar o cenário que o agente devolveu | formatter.ts |

DEPENDE de FIX-104 + FIX-106 (bloco-jornada). Coordene via contrato
(`TODO(bloco-jornada-entrada)`).

## Regressão exigida (3 camadas)
- Camada 1: formatter — value_picker não vira mais lista de faixas; simulador apresenta o cenário.
- Camada 2: cassette WhatsApp — usuário pede "e em 6 meses?" → apresenta o cenário recalculado.
