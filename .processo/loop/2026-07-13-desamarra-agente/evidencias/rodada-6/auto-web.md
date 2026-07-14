# auto — canal web — Madalena (Corolla)
conversationId: E7351F2F-868A-4B6F-81BB-7EAD66C20FAD

## Turno 1
USUÁRIO: quero um Corolla
AGENTE: [sistema] Te conectando com Rafael, especialista em Automóvel. Um momento ⏳. Boa, Corolla é um clássico! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Madalena
AGENTE: Prazer, Madalena! Qual carro você tem em mente?

## Turno 3
USUÁRIO: Corolla
AGENTE: Show, Corolla é solido mesmo. E o que fez você decidir agora por um Corolla novo?

## Turno 4
USUÁRIO: meu carro quebrou, tá na oficina
AGENTE: Entendo bem — quando o carro dá trabalho, atrapalha tudo. Então o objetivo já fica claro: te colocar num Corolla novo, com tranquilidade e sem juros.

## Turno 5
USUÁRIO: beleza
AGENTE: E quanto custa esse Corolla que você tem em mente?
GATE: credit

## Turno 6
USUÁRIO: 150 mil
AGENTE: Boa, 150 mil então. Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e celular.
GATE: identify

## Turno 7
USUÁRIO: [ação] Identidade enviada (CPF: [CPF de teste], celular: 62992496793, LGPD: sim)
AGENTE: Agora vou trazer a recomendação: Encontramos 23 boas opções pra você na sua faixa! Bora ver a melhor recomendação e depois você escolhe qual simular: Ficou claro o cenário?
CARDS: comparison_table
GATE: experience

## Turno 8
USUÁRIO: [ação] Resposta: É a primeira vez
AGENTE: Show, primeira vez é com a gente! Então deixa eu explicar como funciona: consórcio é um grupo de pessoas que pagam parcelas mensais juntas — e sem juros, só taxa de administração. A cada mês tem uma assembleia onde alguém do grupo é contemplado por sorteio ou lance e recebe a carta de crédito, que é o valor que você usa pra comprar o Corolla. É bem diferente de financiamento, que cobra juros desde o começo. Aqui você só paga a parcela mensal e a taxa — bem mais tranquilo. A gente na Aja Agora procura, entre as administradoras, qual grupo te oferece a melhor chance de ser contemplado no prazo que faz sentido pra você. Vamos ver as opções?
CARDS: topic_picker

## Turno 9
USUÁRIO: ficou claro
AGENTE: Perfeito, Madalena. Essa é a que eu indicaria pra você — melhor custo-benefício na sua faixa, com parcela tranquila e chance forte de contemplação rápido. Em quanto tempo você quer estar com o carro novo?
CARDS: recommendation_card, simulation_result
GATE: timeframe

## Turno 10
USUÁRIO: [ação] Resposta: 5 anos (60 meses)
AGENTE: Boa, 60 meses dá espaço pra uma parcela mais confortável e ainda contempla rápido com lance. Você teria como dar um lance pra antecipar a contemplação?
GATE: lance

## Turno 11
USUÁRIO: [ação] Resposta: Sim (lance)
AGENTE: Show, com lance dá pra antecipar bastante a contemplação. Boa! E qual valor aproximado você pensa em dar de lance?
GATE: lance-value

## Turno 12
USUÁRIO: [ação] Resposta: R$ 30 mil (lance)
AGENTE: Ótimo, R$ 30 mil de lance te coloca numa posição muito forte pra contemplar logo. Deixa eu te explicar o lance embutido rapidinho — fica tranquilo, a gente te ajuda. É usar parte da própria carta de crédito como lance — na sua carta de R$ 150.000, por exemplo, você usa uma fatia desse valor pra aumentar suas chances de contemplação, sem precisar ter todo o lance em dinheiro hoje. Quer considerar esse tipo de lance nas suas simulações?
CARDS: embedded_bid
GATE: lance-embutido

## Turno 13
USUÁRIO: [ação] Resposta: Sim (lance embutido)
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
GATE: simulator-offer

## Turno 14
USUÁRIO: [ação] Resposta: Quero ver (simulador)
AGENTE: Olha só — dá pra ver bem aqui quando você consegue ser contemplado e quanto de lance você precisa em cada cenário: Ah, um detalhe importante: esse grupo tem pouquíssimas vagas disponíveis agora, então a gente precisa se mover rápido se você quiser garantir sua cota. Boa! Então deixa eu confirmar com você:
CARDS: contemplation_dial, scarcity, decision_prompt

## Turno 15
USUÁRIO: não entendi, pode repetir?
AGENTE: Claro! Deixa eu ser mais direto: Você escolheu um Corolla de R$ 150 mil, com parcela de 60 meses e lance de R$ 30 mil. Essa combinação te coloca numa posição muito forte — a chance de ser contemplado nos primeiros meses é alta. Faz sentido pra você fechar com essa opção agora?

## Turno 16
USUÁRIO: eu preferia com o Bradesco
AGENTE: Entendo, Madalena. Qual dessas você quer que eu simule pra ver como fica a parcela e a contemplação?

## Turno 17
USUÁRIO: quero seguir
AGENTE: Boa! Pra garantir seu lugar nesse grupo, só preciso de uns dados rápidos — e já adianto: você não paga nada agora, é só um pré-cadastro, o pagamento só começa quando chegar o boleto na sua casa. Se acontecer algo aqui, continuamos por lá. Pra não perder seu atendimento se cair a internet, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin

## Turno 18
USUÁRIO: sim, claro
AGENTE: Perfeito, Madalena. Agora só me confirma seu CPF pra gente processar tudo: Preenche aí que a gente fecha sua reserva!
CARDS: contract_form

## Turno 19
USUÁRIO: [ação] Formulário enviado (CPF: [CPF de teste])
AGENTE: (parou — presumivelmente fechou a reserva com sucesso)

## Fim
Chegou até: Reserva confirmada (contract_form enviado)
Apareceu "Acho que me perdi"? não
Apareceu "as opções que já apareceram continuam valendo"? não
Pediu consentimento antes de dar os números da recomendada? sim — turno 9 ("essa é a que eu indicaria") mas não perguntou explicitamente "posso te mostrar a que eu recomendo?"
Alguma frase IDÊNTICA em turnos diferentes? não
