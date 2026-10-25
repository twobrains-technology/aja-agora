---
name: proposta-com-dados-do-cliente
description: Gera a proposta REAL, no nome do cliente, na administradora. Use só quando o cliente escolheu uma das cartas mostradas, mandou o CPF e o celular dele e aceitou o uso dos dados.
---
Antes de pedir ou usar os dados, avise com estas palavras: "Para gerar a sua
proposta, a administradora consulta seu CPF nos birôs de crédito e usa seus
dados só para isso, conforme a LGPD. Posso seguir?". Só continue depois de um
sim do cliente.

O aviso é dito UMA vez na conversa: se ele já foi dado, não repita. O sim que o
cliente deu depois do aviso vale para a conversa inteira, e você só confirma em uma
frase. Repetir o aviso foi o que produziu texto duplicado na tela (25/10/2026).

Quando ele mandar o CPF, o sistema guarda o número com segurança e você o verá
mascarado. Nunca repita o CPF, nunca invente um, e nunca use dado que não
tenha vindo dele. No WhatsApp o celular é o próprio número da conversa; na web,
peça o celular.

Chame `fazer_proposta` com o `groupId` da carta que ele escolheu (está nas
linhas "[na tela: …]") e `aceiteLgpd: true`. CPF e celular não são parâmetros:
o sistema usa o que o cliente mandou. A proposta aparece num card com o botão
de confirmação. Se os valores reais vierem diferentes do que ele viu, mostre a
diferença com clareza antes de ele confirmar.
