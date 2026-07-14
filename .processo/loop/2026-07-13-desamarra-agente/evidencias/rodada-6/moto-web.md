# moto — canal web — Mario (Moto delivery)
conversationId: BF4E9921-2C7E-417B-ADDE-40B3F91C2D3D

## Turno 1
USUÁRIO: quero uma moto
AGENTE: [sistema] Te conectando com Bruno, especialista em Moto. Um momento ⏳. Show, moto nova abre um mundo de possibilidades! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Mario
AGENTE: Beleza, Mario. Qual moto você tem em mente?

## Turno 3
USUÁRIO: uma moto pra delivery
AGENTE: Entendo bem — quando a moto é pro trabalho, precisa ser confiável e sem parar na oficina. Então o objetivo já fica claro: te colocar numa moto nova, preparada pra rodar firme no delivery. E quanto custa essa moto pra delivery hoje?
GATE: credit

## Turno 4
USUÁRIO: 35 mil
AGENTE: Boa, 35 mil então. Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e celular.
GATE: identify

## Turno 5
USUÁRIO: [ação] Identidade enviada (CPF: [CPF de teste], celular: 62992496793, LGPD: sim)
AGENTE: Encontramos 4 opções sólidas pra você — cada uma com um jeito diferente de rodar. Agora dá uma olhada nos números da melhor opção: Você já fez consórcio antes?
CARDS: comparison_table
GATE: experience

## Turno 6
USUÁRIO: [ação] Resposta: É a primeira vez
AGENTE: Show, Mario! Consórcio é bem simples: você entra num grupo e paga uma parcela mensal — sem juros, só taxa de administração. A cada mês tem uma assembleia onde alguém do grupo é contemplado por sorteio ou lance e recebe a carta de crédito, que é o dinheiro pra comprar a moto. Bem diferente de financiamento, que vem com juros pesados e já sai o crédito na hora. Nosso papel aqui na Aja é buscar entre as administradoras qual grupo faz mais sentido pro seu objetivo: colocar você numa moto nova pra delivery, com a melhor chance de contemplação rápida e parcela que cabe no seu bolso. Vamo ver as opções?
CARDS: topic_picker

## Turno 7
USUÁRIO: tá bom
AGENTE: Perfeito, Mario. Olha só: A melhor opção pra você é essa: Tem interesse em fechar com essa, ou quer ver as outras opções?

## Turno 8
USUÁRIO: não entendi bem, quais são as outras opções?
AGENTE: Claro! Deixa eu mostrar todas as 4 opções que a gente conseguiu pra você — aí fica mais fácil comparar e você escolhe qual faz mais sentido:

## Turno 9
USUÁRIO: mas tem alguma do Bradesco?
AGENTE: Boa pergunta, Mario. As que a gente conseguiu mesmo são: **Banco do Brasil**, **Tradição** e **Canopus** — todas sólidas e com bom histórico de contemplação. Quer que eu aprofunde em alguma delas, ou prefere que a gente volta pra simular a melhor opção que recomendei?

## Turno 10
USUÁRIO: pode ser, qual você recomenda?
AGENTE: A *Banco do Brasil* é a que melhor encaixa no seu perfil, Mario — parcela tranquila e contempla bastante gente por mês.

## Turno 11
USUÁRIO: quero sim
AGENTE: Ótimo, Mario. Essa é a que eu indicaria pra você — melhor custo-benefício e chance sólida de contemplar rápido: Em quanto tempo você quer estar com a moto nova?
CARDS: recommendation_card, simulation_result
GATE: timeframe

## Turno 12
USUÁRIO: [ação] Resposta: 2 anos (24 meses)
AGENTE: Tranquilo, Mario — prazo maior deixa a parcela mais leve todo mês. Você teria como dar um lance pra antecipar a contemplação?
GATE: lance

## Turno 13
USUÁRIO: [ação] Resposta: Não (lance)
AGENTE: Entendi, Mario. Então vamos com o consórcio tradicional mesmo — parcela mensal, e você contempla por sorteio ou dando um lance quando chegar a hora. Deixa eu te explicar o lance embutido rapidinho — fica tranquilo, a gente te ajuda. É usar parte da própria carta de crédito como lance — na sua carta de R$ 35.738, por exemplo, você usa uma fatia desse valor pra aumentar suas chances de contemplação, sem precisar ter todo o lance em dinheiro hoje. Quer considerar esse tipo de lance nas suas simulações?
CARDS: embedded_bid
GATE: lance-embutido

## Turno 14
USUÁRIO: [ação] Resposta: Não (lance embutido)
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
GATE: simulator-offer

## Turno 15
USUÁRIO: [ação] Resposta: Quero ver (simulador)
AGENTE: Dá pra ver bem aqui quando você consegue ser contemplado e quanto precisa dar de lance em cada cenário: Ah, e um detalhe importante, Mario — esse grupo tem demanda alta, então as vagas preenchem rápido. Show, Mario! Esse plano encaixa bem no que você pediu — bora confirmar com você agora.
CARDS: contemplation_dial, scarcity, decision_prompt

## Turno 16
USUÁRIO: pode ser, quero seguir
AGENTE: Perfeito, Mario! Pra garantir seu lugar nesse grupo, só preciso de uns dados rápidos — e você não paga nada agora, é só um pré-cadastro. O pagamento só começa quando chegar o boleto na sua casa. Se acontecer algo aqui, continuamos por lá sem problema. Pra não perder seu atendimento se a gente cair da internet, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin

## Turno 17
USUÁRIO: sim, claro
AGENTE: Ótimo! Qual é o seu número?

## Turno 18
USUÁRIO: 62992496793
AGENTE: Anotado! Agora é só preencher o formulário de contratação rápido — CPF, confirmar seus dados e é isso:
CARDS: contract_form

## Turno 19
USUÁRIO: [ação] Formulário enviado (CPF: [CPF de teste])
AGENTE: (parou — presumivelmente fechou a reserva com sucesso)

## Fim
Chegou até: Reserva confirmada (contract_form enviado)
Apareceu "Acho que me perdi"? não
Apareceu "as opções que já apareceram continuam valendo"? não
Pediu consentimento antes de dar os números da recomendada? sim — mas não perguntou explicitamente "posso te mostrar a que eu recomendo?" (padrão "Quer que eu aprofunde em alguma delas, ou prefere que a gente volta pra simular...")
Alguma frase IDÊNTICA em turnos diferentes? "Ótimo/Boa" é comum; "Essa é a que eu indicaria pra você" (turnos 9 e 11 da AUTO também); "O pagamento só começa quando chegar o boleto na sua casa" (template repetido)
