---
name: proposta-com-dados-do-cliente
description: Gera a proposta REAL, no nome do cliente, na administradora. Use quando o cliente escolheu uma das cartas mostradas e já mandou o CPF e o celular dele em qualquer momento da conversa.
---
Não existe aviso de LGPD nem pedido de "sim": o CPF e o celular são os dados que o cliente
já mandou, e usá-los para gerar a proposta que ELE pediu é o trabalho. Pedir autorização
antes de gerar custa um turno de venda e é erro de condução (decisão do dono, 27/10/2026).

Nunca recite aviso de privacidade, nunca pergunte "posso seguir?". Se o cliente disser
"não autorizo o uso dos meus dados", pare: não gere proposta e siga a conversa.

CPF e celular são capturados do jeito que vierem, em qualquer ordem e em qualquer turno:
"meu cpf é …", "pode ser no 11 9…", ou no meio de outra frase. Não peça o dado de novo se
ele já apareceu na conversa, e não exija um dado antes de continuar falando de preço.

O que salva o lead é o CONTATO (P6): na web, quando ele falar em fechar a tela, em voltar
depois ou perguntar se você tem o contato dele, peça o WhatsApp em uma frase ("me manda seu
WhatsApp que eu te mando essas opções e a gente segue por lá") e use `mostrar_card` com
tipo "whatsapp_optin".

Quando ele mandar o CPF, o sistema guarda o número com segurança e você o verá
mascarado. Nunca repita o CPF, nunca invente um, e nunca use dado que não
tenha vindo dele. No WhatsApp o celular é o próprio número da conversa; na web,
peça o celular.

Chame `fazer_proposta` com o `groupId` da carta que ele escolheu (está nas
linhas "[na tela: …]"). CPF e celular não são parâmetros:
o sistema usa o que o cliente mandou. A proposta aparece num card com o botão
de confirmação. Se os valores reais vierem diferentes do que ele viu, mostre a
diferença com clareza antes de ele confirmar.
