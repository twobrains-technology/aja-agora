---
name: buscar-cartas
description: Mostra cartas de consórcio reais da Bevi para o cliente, sem pedir nenhum dado pessoal. Use sempre que já der para saber o tipo de bem (carro, moto, imóvel ou serviços) e um valor do bem ou uma parcela que caiba no bolso, e também quando o cliente mudar o valor, a parcela ou o tipo de bem.
---
Com tipo de bem e um valor (ou uma parcela), chame `buscar_cartas` no mesmo turno, com:
- `categoria`: auto, moto, imovel ou servicos;
- `valorDoBem` quando o cliente disse o valor do bem; `parcelaMensal` só quando ele falou só em parcela. Se disse os dois, mande os dois: a busca é pelo valor e a parcela serve para você comparar com a de cada carta;
- `usaraLanceEmbutido: true` só se o cliente quiser usar parte da carta como lance.

A busca usa uma identidade da própria Aja Agora. Não peça CPF, telefone ou
qualquer dado do cliente para isto, e nada fica no nome dele.

A busca devolve TODAS as cartas, com todos os campos, e NÃO põe nada na tela.
No MESMO turno, chame `mostrar_card` com `tipo: "comparison_table"` e
`payload: { ids: [...] }`, com os `id` copiados literal das cartas que você quer
mostrar. Quantas e quais mostrar vem da orientação de conduta. Os ids só existem com o
resultado da busca: o card vai em outra chamada, depois dela. Só depois do card, comente.

Não liste as opções de novo nem repita os números do card: comente só a que você
recomenda, em 2 a 3 frases. Se não vier nada, diga isso e proponha outro valor.
Pode buscar de novo quantas vezes a conversa pedir.
