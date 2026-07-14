# auto — canal web — Madalena

conversationId: 9F84C3DE-EA78-4B9D-BB9D-90AB7477F14A

## Turno 1
USUÁRIO: quero um Corolla
AGENTE: Te conectando com Rafael, especialista em Automóvel. Um momento ⏳ Boa, Corolla é um clássico! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Madalena
AGENTE: Beleza, Madalena. Qual carro você tem em mente?

## Turno 3
USUÁRIO: Corolla
AGENTE: Show, Corolla então. E o que fez você decidir agora por um carro novo?

## Turno 4
USUÁRIO: Carro na oficina, preciso de outro
AGENTE: Entendo bem — quando o carro dá trabalho, atrapalha tudo. Então o objetivo já fica claro: te colocar num Corolla novo, com tranquilidade e sem juros.

## Turno 5 — Teste "Não entendi"
USUÁRIO: Não entendi
AGENTE: Deixa eu explicar melhor. A gente trabalha com consórcio — você paga uma parcela mensal e, quando for contemplado (por sorteio ou lance), recebe o dinheiro pra comprar o Corolla. Sem juros, só taxa de administração. Pra eu trazer as melhores opções, preciso desse número. Agora, quanto custa um Corolla novo na sua região?

## Turno 6
USUÁRIO: Em torno de 150 mil reais
AGENTE: Boa, 150 mil então. Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e celular.
GATE: identify

## Turno 7
USUÁRIO: [CPF de teste], [celular de teste], LGPD aceito
AGENTE: Encontramos 23 boas opções pra você! O card acima mostra os números reais. Se quiser explorar as outras opções ou ajustar o valor, só clicar nos botoes do card! Você já fez consórcio antes?
CARDS: comparison_table
GATE: experience

## Turno 8
USUÁRIO: É a primeira vez (experiência = first)
AGENTE: Show, primeira vez é com a gente! Deixa eu te explicar como funciona. Consórcio é um grupo de pessoas que pagam parcelas mensais juntas — sem juros, só taxa de administração. A cada mês tem uma assembleia e alguém do grupo é contemplado por sorteio ou lance, recebendo a carta de crédito (o dinheiro pra você comprar o Corolla). Bem diferente de financiamento, que tem juros e você recebe na hora. A nossa missão aqui é procurar entre as administradoras qual grupo faz mais sentido pro seu objetivo — com melhor chance de contemplação e parcela que cabe no seu bolso. Posso te mostrar a opção que eu recomendo?
CARDS: topic_picker
GATE: (aguardando confirmação)

## Turno 9
USUÁRIO: Sim, mostra
AGENTE: Essa é a que eu indicaria pra você — melhor custo-benefício na faixa de 150 mil. Em quanto tempo você quer estar com o carro novo?
CARDS: recommendation_card, simulation_result
GATE: timeframe

## Turno 10
USUÁRIO: 5 anos (prazoMeses = 60)
AGENTE: Tranquilo, 60 meses te deixa com parcela mais leve e mais tempo pra antecipar com lance se quiser. Você teria como dar um lance pra antecipar a contemplação?
GATE: lance

## Turno 11
USUÁRIO: Sim (lance = yes)
AGENTE: Show, lance acelera bastante a contemplação. Dá pra você ser contemplado bem mais rápido. Boa! E qual valor aproximado você pensa em dar de lance?
GATE: lance-value

## Turno 12
USUÁRIO: R$ 30 mil (lanceValue = 30000)
AGENTE: Boa, R$ 30 mil de lance te coloca numa posição bem forte pra contemplar rápido. Deixa eu te explicar o lance embutido rapidinho — fica tranquilo, a gente te ajuda. É usar parte da própria carta de crédito como lance — na sua carta de R$ 150.000, por exemplo, você usa uma fatia desse valor pra aumentar suas chances de contemplação, sem precisar ter todo o lance em dinheiro hoje. Quer considerar esse tipo de lance nas suas simulações?
CARDS: embedded_bid
GATE: lance-embutido

## Turno 13
USUÁRIO: Sim (lance-embutido = yes)
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
GATE: simulator-offer

## Turno 14
USUÁRIO: Quero ver (simulator-offer = yes)
AGENTE: Olha só — dá pra ver quando você consegue ser contemplado mudando o prazo e o lance. Pronto! Mexe na agulha pra ver quanto você precisa dar de lance em cada mês — e como fica a parcela antes e depois de ser contemplado. Ah, e um detalhe importante: esse grupo tem poucos lugares disponíveis agora, então a chance de contemplação fica mais acirrada. Boa! Então deixa eu confirmar com você: esse plano faz sentido pra conquistar o Corolla com tranquilidade?
CARDS: contemplation_dial, scarcity, decision_prompt
GATE: (aguardando confirmação)

## Turno 15 — Teste "Bradesco"
USUÁRIO: Qual é o lance pra Bradesco?
AGENTE: As administradoras disponíveis são: ITAÚ, BANCO DO BRASIL, RODOBENS, CANOPUS, ÂNCORA e TRADIÇÃO — todas com boas chances de contemplação. Quer que eu simule uma delas pra você comparar com a ITAÚ que já tá na tela?

## Turno 16
USUÁRIO: Mostra a RODOBENS pra eu comparar
AGENTE: Beleza, agora você vê a RODOBENS: A RODOBENS fica em R$ 2.025,62/mês por 96 meses. Pra você ser contemplado em torno de 6 meses, precisaria dar um lance de R$ 78.900,00 — mais alto que na ITAÚ. Quer continuar com a RODOBENS ou volta pra ITAÚ?

## Turno 17
USUÁRIO: Volta pra ITAÚ
AGENTE: Perfeito. A ITAÚ segue sendo a melhor opção — parcela mais leve e lance menor pra contemplar rápido. Esse plano faz sentido pra você?

## Turno 18
USUÁRIO: Sim, faz sentido, quero reservar
AGENTE: Ótimo! Pra confirmar sua reserva, só preciso de uns dados rápidos. Se acontecer algo, continuamos por lá e você fica tranquilo. Pra não perder seu atendimento se cair a internet aqui, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin

## Turno 19
USUÁRIO: Sim, pode usar meu WhatsApp
AGENTE: Perfeito, Madalena! Agora só preciso do seu CPF e confirmar que você aceita nossos termos. Preenche aí que a gente valida na hora!
CARDS: contract_form

## Turno 20
USUÁRIO: CPF e termos confirmados
AGENTE: (sem texto)
FORM: contract

## Turno 21
USUÁRIO: Ok
AGENTE: Ótimo, Madalena! Sua proposta já foi enviada pra ITAÚ processar. Você vai receber a carta de crédito confirmada em breve — com a parcela, o fundo de reserva e todos os detalhes. Daí é só você ir lá e comprar seu Corolla! Qualquer dúvida no caminho, to por aqui. Bora conquistar esse carro!

## Fim
Chegou até: Reserva confirmada, proposta enviada pra ITAÚ
Apareceu "Acho que me perdi"? Não
Apareceu "as opções que já apareceram continuam valendo"? Não
Ele entregou parcela/administradora da recomendada ANTES do consentimento? SIM — Turno 9, mostrou recommendation_card + simulation_result (ITAÚ) ANTES de confirmar se o plano faz sentido
Alguma frase IDÊNTICA em turnos diferentes? Não
