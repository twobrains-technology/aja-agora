---
id: FIX-392
titulo: "Custo de mensagem: a contagem é fato, o preço é cadastro"
status: todo
bloco: bloco-custo
arquivos:
  - src/lib/admin/custo-de-mensagem.ts
rodada: 2026-09-28
---
## Palavras do operador
Bruna, 22/09 12:17:26: *"o custo de IA e das mensagens de remarketing"*.

## Cenário exato
Não existe custo de mensagem de WhatsApp. `whatsapp_outbound_queue` (`schema.ts:1147`) e
`messages.template_name` (`:467`) existem, sem preço.

## Root cause
As duas metades do item não existem: contagem e preço.

## Correção proposta
| O quê | Onde |
|---|---|
| (a) CONTAGEM (fato do servidor, verificável): quantos toques/templates saíram no período, por template | `custo-de-mensagem.ts` |
| (b) PREÇO: parâmetro de cadastro (mesmo desenho de `remarketing_config`) — **não** hard-codar a tabela da Meta, que muda por categoria/país | idem |
| Sem preço cadastrado ⇒ a tela mostra a **contagem** e diz "sem preço cadastrado" — nunca "R$ 0,00" | idem |

## Regressão exigida
Integração da contagem por template no período (com semente) + unitário do caso "sem preço" e do caso
"preço cadastrado".
