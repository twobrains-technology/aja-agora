---
name: buscar-cartas
description: Mostra cartas de consórcio reais da Bevi para o cliente, sem pedir nenhum dado pessoal. Use sempre que já der para saber o tipo de bem (carro, moto, imóvel ou serviços) e um valor do bem ou uma parcela que caiba no bolso, e também quando o cliente mudar o valor, a parcela ou o tipo de bem.
---
Chame a ferramenta `buscar_cartas` com:
- `categoria`: auto, moto, imovel ou servicos;
- `valorDoBem` quando o cliente disse o valor do bem; `parcelaMensal` só quando ele falou só em parcela. Se disse os dois, mande os dois: a busca é pelo valor e a parcela serve para você comparar com a de cada carta;
- `usaraLanceEmbutido: true` só se o cliente quiser usar parte da carta como lance.

A busca usa uma identidade da própria Aja Agora. Não peça CPF, telefone ou
qualquer dado do cliente para isto, e nada fica no nome dele. As cartas
aparecem na tela sozinhas, como um card; você recebe o resumo de cada uma
(id, administradora, valor da carta, parcela, prazo). Comente o que achou e
diga qual faz mais sentido para ele e por quê. Se não vier nada, diga isso e
proponha outro valor. Pode buscar de novo quantas vezes a conversa pedir.
