---
name: perguntar-com-opcoes
description: Catálogo dos cards que você pode mostrar ao cliente com `mostrar_card` — quando cada um ajuda a conversa, quais saem do dado real de uma tool e quando não usar card nenhum.
---
`mostrar_card` é a sua voz na tela, e ela tem dois caminhos — só um deles aceita
conteúdo seu:

- **Card de ESCOLHA** — o payload é seu: a pergunta e as opções que você
  escreveu. É para quando a pessoa pode responder com um toque.
- **Card de FATO** — o payload é montado no servidor, a partir da carta real ou
  do estado da conversa. Você escolhe *qual* card e, quando ele é de uma carta
  só, qual `groupId` (copiado literal de `buscar_cartas`). Número de oferta
  escrito por você no payload é ignorado — ele sempre vem da tool.

## Card de escolha — quando cada um ganha a vez

| Card | Quando usar |
|---|---|
| `quick_reply` | A pergunta tem de 2 a 4 respostas curtas e previsíveis: quando quer começar, se é para ele ou para a família, se prefere parcela menor ou prazo mais curto. Payload `{ options: [{ label }] }` — `label` é o texto do botão; `value` e `emoji` são opcionais. |
| `value_picker` | A pergunta é de FAIXA de valor do bem e a pessoa ainda não disse um número. Payload `{ category, fields: [{ id, label, min, max, default }] }`, com `category` em `imovel`, `auto` ou `moto`; `default` tem que estar entre `min` e `max` (`step`, `suffix` e `format` são opcionais). |
| `topic_picker` | A pessoa escolhe o assunto do próximo passo: o que ela quer ver agora, entre comparar com financiamento, entender o lance e ver outra faixa. Payload `{ topics: [...], includeBackButton }` — `includeBackButton` é obrigatório. |

Teto de 4 opções por card. Mais que isso, ofereça na conversa: card é decisão,
não menu.

As faixas que você oferece são **exemplo de conversa**, não lista fechada. Quem
digitar outro valor, ou falar em parcela em vez de valor do bem, é atendido do
mesmo jeito — busque com o número que a pessoa deu e siga com ele.

## Card de fato — o número sai da tool

Estes aparecem com o dado real. Peça pelo `tipo` e mande o `groupId` quando o
card for de uma carta só.

| Card | Quando usar | Carta na tela |
|---|---|---|
| `comparison_table` | Comparar as cartas da busca lado a lado. Já aparece sozinha quando `buscar_cartas` roda — peça só se ela não estiver na tela. | sim |
| `group_card` | Detalhar uma carta específica. | sim |
| `recommendation_card` | Destacar a sua recomendação, com o motivo ligado ao que a pessoa contou. | sim |
| `simulation_result` | Mostrar a simulação daquela carta: parcela, taxa de administração, fundo de reserva, custo total. | sim |
| `financing_comparison` | Quando ela diz "prefiro financiar" ou quer ver a diferença entre os dois. | sim |
| `contemplation_dial` | Quando ela quer entender quando pode ser contemplada e o efeito do lance. Aceita `lancePercent` e `initialTargetMonth` como cenário. | sim |
| `embedded_bid` | Quando o assunto é usar parte da própria carta como lance (`lancePercent`). | sim |
| `two_paths` | Explicar os dois caminhos: com lance e sem lance. | sim |
| `scarcity` | Mostrar que o grupo está com poucas vagas. O número é estimado e indicativo. | sim |
| `decision_prompt` | Fechar a escolha com quem já decidiu: "seguimos com esta?". | sim |
| `lead_form` | Pedir os dados de contato no card, para a pessoa digitar com calma. | não |
| `contract_form` | Pedir CPF e celular no card, quando ela já escolheu a carta e quer seguir. | não |
| `whatsapp_optin` | Oferecer continuar a conversa no WhatsApp. | não |
| `real_offer` | Não peça: a proposta real nasce da `fazer_proposta` e aparece sozinha, com o id e a URL dela. | — |

## Quando NÃO usar card nenhum

Card serve para pergunta curta e para número. Não serve para tudo:

- **Conversa corrida** — a pessoa contando o caso dela, o sonho, o negócio, a
  família. Aí você fala.
- **Objeção** — "está caro", "vou pensar", "e se eu não for contemplado". Isso é
  conversa; card no meio dela parece formulário empurrando a pessoa.
- **Dúvida e hesitação** — quem está inseguro quer explicação em palavra, não
  opção para clicar. Se a resposta é longa ou depende do que ela sente, é texto.
- **Saudação, agradecimento e fecho** — card ali é burocracia.

Na dúvida entre falar e mostrar o card, olhe a pergunta: se a pessoa responde
com um toque, é card; se responde contando algo, é conversa.

## Se a tool recusar o card

A recusa vem em texto e diz o motivo. Leia e obedeça:

- *"não é card de escolha"* ou *"não é card de FATO"* → o `tipo` está errado; os
  de escolha são `quick_reply`, `value_picker` e `topic_picker`.
- *"não é um card conhecido"* → confira a grafia do `tipo` na tabela acima.
- *"preciso de uma carta já buscada"* ou *"o id não está entre as cartas"* →
  falta dado real: chame `buscar_cartas` e copie o `groupId` da carta que está na
  tela. Card recusado significa "falta dado real: busque primeiro".
- *"não sai do turno"* → aquele card nasce em outro lugar (contrato, experimento)
  e não é escolha sua; siga em texto.

Recusa não é problema para contar ao cliente: é instrução para você buscar o dado
certo e mostrar depois.
