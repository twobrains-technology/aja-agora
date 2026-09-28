---
id: FIX-380
titulo: "A forma do envio: reusar o que já existe antes de pedir coluna nova"
status: done
bloco: bloco-toques
arquivos:
  - src/lib/admin/remarketing-queries.ts
  - src/lib/admin/remarketing-tela.ts
rodada: 2026-09-28
commit: f790469e
executado_em: 2026-09-28
---
## Palavras do operador
Reunião de 22/09 (Kairo, 12:12:30): *"E como que foi? Foi o primeiro toque, o segundo ou o terceiro?"*

## Cenário exato
A tela diz o passo, mas não diz se aquele toque saiu como **template** (fora da janela) ou como
**turno de retomada** (texto livre, dentro da janela) — e essa diferença é a explicação de por que o
texto muda de um para o outro.

## Root cause
Nada deriva a forma: `grep templateUrl src/lib/admin/remarketing-tela.ts remarketing-queries.ts` = 0
hits. `messages.template_name` (`schema.ts:467`) e `whatsapp_outbound_queue` (`:1147`) registram o
template e a fila — o reuso é possível e deve ser avaliado ANTES de pedir migration.

## Correção proposta
| O quê | Onde |
|---|---|
| Derivar a forma de `messages.template_name` + `whatsapp_outbound_queue` quando existir | `remarketing-queries.ts` |
| Fluxo do toque: turno de retomada ⇒ "texto livre"; template enfileirado ⇒ "template aguardando"; template aprovado ⇒ nome do template | `remarketing-tela.ts` |
| Só criar coluna se o reuso não cobrir — e, se criar, a tela diz que o histórico anterior é `NULL` (nunca "texto livre" por omissão) | — |

## Regressão exigida
Unitário da derivação com os três estados e o caso `NULL` (histórico anterior à migration).
