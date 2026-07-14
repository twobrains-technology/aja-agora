# servicos — canal whatsapp — Bruno
conversationId: 6761afdd-8d98-42dd-b593-c495dcbc2991

> Coleta pelo SSE do simulador (`/api/admin/simulator/whatsapp/<id>/stream`) — é o
> que o cliente recebe. O log do container trunca o balão em 140 chars
> (`src/lib/whatsapp/api.ts:99`) e não emite os botões; por isso não foi usado.

## Turno 1
USUÁRIO: oi, queria reformar minha casa mas não entendo nada de consórcio
AGENTE:
Te conectando com Camila, especialista em Serviços.
Um momento ⏳
---
Boa, reforma é um sonho bacana! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?

## Turno 2
USUÁRIO: Bruno
AGENTE:
Beleza, Bruno.
---
O que você tem em mente pra realizar?

## Turno 3
USUÁRIO: a reforma da minha casa, uns 30 mil
AGENTE:
Pra eu analisar várias administradoras e achar as opções mais aderentes ao seu perfil, preciso confirmar quem é você. Seus dados ficam protegidos (LGPD).
---
Me manda seu CPF, só os números. Seu celular eu já pego aqui do WhatsApp.

## Turno 4
USUÁRIO: [CPF de teste]
AGENTE:
Perfeito, recebido! Já vou buscar as melhores opções.

## Turno 5
USUÁRIO: não entendi
AGENTE:
Ótimo, encontramos 3 boas opções na sua faixa. Agora vamos te recomendar a mais adequada:

Vou apresentar as opções pra você escolher uma:

Agora você pode clicar numa opção pra simular e ver os detalhes — ou quer que eu aprofunde em alguma delas?
---
*Comparativo — 3 opções encontradas*
Selecione uma para ver detalhes:
[BOTÕES] [group_6a3e6ceb419653c0a9993277] ÂNCORA  |  [group_6a3e6cee419653c0a99944f7] TRADIÇÃO  |  [group_6a3e6ced419653c0a9994096] RODOBENS
---
Deixa eu explicar de forma simples, Bruno.

Consórcio funciona assim: você entra num grupo de pessoas que pagam parcelas mensais. A cada mês tem um sorteio, e quem é sorteado (ou quem der um lance maior) recebe o crédito pra fazer a reforma. Sem juros — você paga só uma taxa de administração.

Faz sentido ir por esse caminho?
---
Escolha uma opção:
[BOTÕES] [experience_first] É a primeira vez  |  [experience_returning] Já conheço  |  [experience_doubts] Tenho dúvidas

## Turno 6
USUÁRIO: (botão) [experience_first] É a primeira vez
AGENTE:
Show, primeira vez é com a gente!

Resumindo rapidinho: consórcio é um grupo de pessoas pagando parcela mensal juntas — sem juros, só taxa de administração. A cada assembleia, alguém é contemplado por sorteio ou lance e recebe a carta de crédito, que é o valor que você usa pra fazer a reforma.

É bem diferente de financiamento, que cobra juros. Aqui você só paga a taxa mesmo.

Nosso papel é procurar entre as administradoras qual grupo encaixa melhor pro seu objetivo — aquele que te dá mais chance de ser contemplado no prazo que você quer. Bora lá?
---
Escolha uma opção:
[BOTÕES] [topic_0] o que é lance?  |  [topic_1] como funciona o sorteio?  |  [topic_2] e quando eu for contempl  |  [topic_3] por que as cartas variam  |  [topic_back] Voltar

## Turno 7
USUÁRIO: (botão) [topic_0] o que é lance?
AGENTE:
Lance é quando você oferece dinheiro extra pra antecipar a sua contemplação. Em vez de ficar só no sorteio mensal, você concorre também naquele mês com um lance — aumenta bastante suas chances de ser contemplado antes.

Tem grupos que permitem também o "lance embutido", que é usar uma parte da própria carta de crédito como lance, sem precisar ter todo o dinheiro agora. Aumenta ainda mais a chance de contemplar rápido.

Faz sentido?

## Turno 8
USUÁRIO: faz. mas por que essa administradora e não outra?
AGENTE:
Boa pergunta, Bruno.

A gente recomendou essa porque ela encaixa melhor no seu perfil — considerando três coisas juntas: a parcela mensal cabe bem no que você pediu, o grupo tem histórico de contemplações fortes, e o prazo pra você receber a reforma fica realista.

A carta e exatamente os R$ 30.000 que você pediu — então o valor bate certinho. A diferença entre uma administradora e outra tá mais no ritmo de contemplação, na taxa de administração e na parcela que você paga mês a mês.

Quer que eu mostre em detalhes como fica a simulação dessa opção, ou prefere comparar com outras pra ter certeza?

## Turno 9
USUÁRIO: mostra os detalhes e depois quero fechar
AGENTE:
Perfeito, Bruno. Deixa eu trazer os detalhes pra você ver como fica: Bruno, as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da administradora ou o valor que você quer olhar de novo que eu detalho certinho pra você.

## Turno 10
USUÁRIO: (botão) [group_6a3e6ceb419653c0a9993277] ÂNCORA
AGENTE:
Beleza, dá uma olhada na simulação da ÂNCORA:

Pronto! Aí está a simulação completa da ÂNCORA com a reforma de R$ 45.000.

Agora é só tocar em "Tenho interesse!

" que a gente fecha tudo pra você.
---
*Simulação de Cota*

*Valor do bem:* R$ 45.000
*Parcela:* R$ 694/mês
*Prazo:* 97 meses

*Com lance embutido (30%):*
Valor que você recebe: R$ 31.500
Lance estimado p/ contemplar: R$ 18.000
[BOTÕES] [interest_6a3e6ceb419653c0a9993277] Tenho interesse!  |  [whatif_6a3e6ceb419653c0a9993277] Ajustar valor

## Turno 11
USUÁRIO: (botão) [interest_6a3e6ceb419653c0a9993277] Tenho interesse!
AGENTE:
Ótimo, Bruno! Pra confirmar sua reserva, só preciso de uns dados rápidos — e já adianto: você não paga nada agora, é só um pré-cadastro. O pagamento só começa quando chegar o boleto na sua casa. Ótimo, Bruno!

 Se acontecer algo, continuamos por lá e você fica tranquilo.

Pra não perder seu atendimento se cair a internet aqui, me compartilha seu WhatsApp?
---
Boa! Já tenho seus dados (CPF 028.•••.•••-38) aqui do nosso atendimento. Posso criar sua proposta real na ÂNCORA? Seus dados seguem protegidos (LGPD).
[BOTÕES] [contract_confirm] Confirmar  |  [contract_cancel] Ver outras
---
Show — como você já está no WhatsApp, vou seguir conversando por aqui mesmo.

## Turno 12
USUÁRIO: (botão) [contract_confirm] Confirmar
AGENTE:
Confirmado com a ÂNCORA:

*Carta:* R$ 30.000
*Parcela:* R$ 462
*Grupo:* 313
*Prazo:* 97 meses
*Lance médio do grupo:* R$ 21.000

Confirma essa carta pra eu seguir?
[BOTÕES] [offer_confirm] Confirmar carta  |  [offer_reject] Ver outras

## Turno 13
USUÁRIO: (botão) [offer_confirm] Confirmar carta
AGENTE:
Perfeito! Sua cota da ÂNCORA está reservada, escolhida pela Aja Agora para o seu perfil. E a Aja Agora segue com você até a contemplação — e depois dela.
---
Você não paga nada agora — é como um booking: só quando chegar o boleto na sua casa.
---
Sua proposta está pronta! Sua proposta de consórcio da ÂNCORA, escolhida pela Aja Agora pro seu perfil, já está gerada — e a gente segue com você até a contemplação.

É só ver a sua proposta aqui:
https://www.uselink.me/1r3WPDDxP
---
Pra completar sua reserva, me manda a foto do seu *RG ou CNH* (frente e verso) aqui mesmo. É opcional — se preferir enviar depois, responde *pular*.
---
Parabéns! Agora você está oficialmente mais perto da sua conquista!
---
Pra gente seguir, olha só: acabei de te mandar uma mensagenzinha no seu WhatsApp.
---
Me responde por lá com um "oi"? É só pra você já salvar o nosso contato.
---
Daí, em alguns minutos, a nossa especialista em cadastros te chama pra pedir seus dados e os documentos pra dar entrada na administradora.

## Fim
Chegou até: **contratação concluída** (turno 13) — cota reservada, proposta gerada com
link, pedido de RG/CNH.

Checagem no banco (fato, não interpretação):
`SELECT count(*) FROM bevi_proposals WHERE conversation_id='6761afdd-…'` → **1**.

O agente deixou de perguntar algo em algum turno? **Sim.**
- **Turno 4** — recebeu o CPF e respondeu só "Perfeito, recebido! Já vou buscar as
  melhores opções." Nenhuma pergunta; conversa parada até eu escrever de novo.
- **Turno 7** — respondeu o tópico "o que é lance?" e fechou com "Faz sentido?" (fecho
  retórico), sem nenhuma pergunta que avançasse o funil.

Outros fatos de transcrição:
- Turno 5 (resposta ao "não entendi"): a explicação de consórcio veio **depois** do
  comparativo de 3 opções, na mesma leva de balões — a ordem foi resultado → explicação.
- Turno 8: "A carta e exatamente os R$ 30.000 que você pediu" (falta o "é": "A carta **é**
  exatamente"). No turno 10 a mesma opção aparece como "reforma de R$ 45.000" / "Valor do
  bem: R$ 45.000"; no turno 12 a carta confirmada volta a ser "R$ 30.000".
- Turno 10: parcela na simulação "R$ 694/mês"; no turno 12 (proposta real) "R$ 462".
- Turnos 9 e 10: texto do botão saiu quebrado — `"Tenho interesse!\n\n"` (aspas e quebra
  de linha no meio da frase).
- Turno 11: balão com "Ótimo, Bruno!" duplicado no meio do próprio parágrafo.
- Turno 11: pediu o WhatsApp ("me compartilha seu WhatsApp?") dentro do próprio canal
  WhatsApp e, no mesmo turno, respondeu a si mesmo ("Show — como você já está no
  WhatsApp, vou seguir conversando por aqui mesmo.").
- Turno 11: exibiu o CPF parcialmente mascarado (028.•••.•••-38).
- Turno 13: "acabei de te mandar uma mensagenzinha no seu WhatsApp" / "Me responde por
  lá com um 'oi'" — estando já no WhatsApp.
