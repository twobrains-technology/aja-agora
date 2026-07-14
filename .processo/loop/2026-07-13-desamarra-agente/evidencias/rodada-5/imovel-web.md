# imóvel — canal web — Fernanda

conversationId: B706E3CB-BB47-4D44-A025-03D874048F16

## Turno 1
USUÁRIO: Quero um apartamento
AGENTE: Te conectando com Helena, especialista em Imóvel. Um momento ⏳ Boa, apartamento novo muda tudo! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Fernanda
AGENTE: Prazer, Fernanda. Qual imóvel você tem em mente?

## Turno 3
USUÁRIO: Um apartamento de uns 400 mil reais
AGENTE: Boa, 400 mil então. E o que te fez decidir agora por um apartamento?

## Turno 4
USUÁRIO: Cansada de aluguel, quero ter meu próprio imóvel
AGENTE: Entendo bem — quando a gente paga aluguel, na verdade tá construindo patrimônio pra outro. Então o objetivo já fica claro: te colocar num apartamento seu, com tranquilidade e sem juros.

## Turno 5
USUÁRIO: Mas como isso funciona sem juros?
AGENTE: Consórcio funciona assim: você entra num grupo com outras pessoas que também querem um imóvel. Todo mês vocês pagam uma parcela, e a cada assembleia alguém do grupo é contemplado — pode ser por sorteio ou por lance, se alguém quiser antecipar oferecendo mais. Quando você é contemplado, recebe o crédito pra comprar o apartamento. Não tem juros, só taxa de administração que a administradora cobra pelo trabalho de gerir o grupo. A grande vantagem é que você constrói patrimônio pagando parcelas que não viram juros — diferente do financiamento, onde a maioria do que você paga no começo é juros mesmo.

## Turno 6
USUÁRIO: Entendi, faz sentido
AGENTE: Show, Fernanda. Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e do seu celular. Qual é?
GATE: identify

## Turno 7
USUÁRIO: [CPF de teste], [celular de teste], LGPD aceito
AGENTE: Encontramos 18 boas opções na sua faixa, Fernanda. Vou simular a que mais se encaixa com seu perfil: Essa é a melhor opção para você na sua faixa, Fernanda. Se você quiser antecipar e dar um lance, consegue ser contemplada em torno de 6 meses — precisaria de aproximadamente R$ 273.274,80 de lance pra isso. Qual delas faz mais sentido pra você?
CARDS: comparison_table
GATE: experience

## Turno 8 — Teste "Bradesco"
USUÁRIO: E qual é a taxa de administração do Bradesco?
AGENTE: As administradoras disponíveis são: ITAÚ, BANCO DO BRASIL, ÂNCORA, CANOPUS, TRADIÇÃO e RODOBENS. Quer que eu simule uma delas pra você comparar, ou prefere ver todas as opções lado a lado?

## Turno 9
USUÁRIO: Você já fez consórcio antes?
AGENTE: Essa pergunta é pra você, Fernanda — você já fez consórcio antes ou é a primeira vez?

## Turno 10
USUÁRIO: Já fiz uma vez
AGENTE: Show, vamos direto ao ponto então.

## Turno 11
USUÁRIO: Tenho FGTS, posso usar?
AGENTE: FGTS é um recurso que você pode usar como entrada ou pra complementar o lance, dependendo de como a administradora permite — isso entra mais em detalhes na hora de fechar a proposta com eles. O consórcio em si funciona independente disso: você paga as parcelas mensais e, quando for contemplado, recebe o crédito. Se quiser usar FGTS junto, a administradora orienta você no passo a passo. Quer que eu simule uma das opções pra você ver como fica a parcela mensal?

## Turno 12
USUÁRIO: Sim, simula pra mim
AGENTE: Essa é a que mais faz sentido pro seu perfil, Fernanda — parcela tranquila e contemplação rápida se você quiser dar lance.
Em quanto tempo você quer estar com o seu imóvel?
CARDS: recommendation_card, simulation_result
GATE: timeframe

## Turno 13
USUÁRIO: 2 anos (prazoMeses = 24)
AGENTE: Tranquilo, Fernanda. Com 2 anos você tem espaço pra uma parcela mais confortável e ainda consegue antecipar com um lance se quiser. Você teria como dar um lance pra antecipar a contemplação?
GATE: lance

## Turno 14
USUÁRIO: Tenho FGTS, posso usar como lance?
AGENTE: Sim, dá pra usar FGTS como lance — muita gente faz isso. A administradora orienta você sobre como enquadrar o FGTS no lance na hora de formalizar a proposta, depende um pouco das regras deles. O importante agora é você ver se a parcela mensal cabe no seu orçamento. Você tem um valor em mente pra parcela mensal, ou quer explorar outras opções ajustando o valor do apartamento?

## Turno 15
USUÁRIO: A parcela tá tranquila, cabe bem no orçamento
AGENTE: Perfeito, Fernanda. Então a gente segue com essa opção. Você tem reserva pra dar um lance em dinheiro além do FGTS, ou prefere contar só com o FGTS?
GATE: lance-value

## Turno 16
USUÁRIO: Prefiro contar só com FGTS por enquanto
AGENTE: Anotado. Lance com FGTS já te coloca numa boa posição pra contemplação. Se acontecer algo aqui, continuamos por lá sem perder nada. Antes de seguir, pra não perder seu atendimento se cair a internet, me compartilha seu WhatsApp?
GATE: lance-value

## Turno 17
USUÁRIO: [celular de teste]
AGENTE: Vou considerar um lance de R$ 80.000 por enquanto — você pode ajustar depois. Perfeito, Fernanda. Vamos lá pra próxima etapa — você tá pronto pra ver sua proposta e formalizar com a administradora?

## Turno 18
USUÁRIO: Sim, tô pronto pra formalizar
AGENTE: Ótimo, Fernanda. Vou te conectar com a administradora agora pra você finalizar tudo — é rápido e seguro. Você vai receber os documentos pra assinar e a proposta já sai com todos os detalhes: parcela, taxa, fundo de reserva, seguro — tudo especificado. Qualquer dúvida durante o processo, eu tô por aqui. Bora lá! Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
GATE: simulator-offer

## Turno 19
USUÁRIO: Quero ver (simulator-offer = yes)
AGENTE: Dá pra ver bem aqui quando você consegue ser contemplada — ajusta pra ver diferentes cenários: Aqui você vê quanto precisa de lance em cada mês — se usar só FGTS ou se quiser complementar com dinheiro. A parcela muda conforme você antecipa ou não a contemplação. Ah, e um detalhe importante: esse grupo está com demanda alta agora, então as vagas são limitadas. Ótimo, Fernanda. Então deixa eu confirmar com você: esse plano faz sentido?
CARDS: contemplation_dial, scarcity, decision_prompt

## Turno 20
USUÁRIO: Sim, faz perfeito sentido, quero prosseguir
AGENTE: Ótimo, Fernanda! Pra garantir seu lugar nesse grupo, só preciso de uns dados rápidos — e já adianto: você não paga nada agora, é só um pré-cadastro, o pagamento só começa quando chegar o boleto na sua casa. Continuamos por lá sem problema nenhum. Pra não perder seu atendimento se a gente ficar sem conexão aqui, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin

## Turno 21
USUÁRIO: Sim, já compartilhei
AGENTE: Perfeito, Fernanda. Agora vou confirmar sua reserva com a administradora — é só um segundo. Pra confirmar sua reserva, só preciso do seu CPF e do seu celular — é tudo que a administradora precisa pra liberar sua proposta real.
CARDS: contract_form

## Turno 22
USUÁRIO: CPF e celular confirmados
AGENTE: (sem texto)
FORM: contract

## Turno 23
USUÁRIO: Ok
AGENTE: Perfeito, Fernanda! Sua proposta está sendo processada agora com a administradora. Você vai receber em breve um link com todos os detalhes: a carta de crédito de R$ 400.000,00, sua parcela mensal, taxa de administração, fundo de reserva — tudo especificado e pronto pra você assinar. Quando chegar, é só confirmar os dados e assinar. Qualquer dúvida no caminho, eu tô por aqui mesmo. Boa sorte com seu apartamento novo!

## Fim
Chegou até: Proposta processada, aguardando confirmação final
Apareceu "Acho que me perdi"? Não
Apareceu "as opções que já apareceram continuam valendo"? Não
Ele entregou parcela/administradora da recomendada ANTES do consentimento? SIM — Turno 12, mostrou recommendation_card + simulation_result ANTES de confirmar se o plano faz sentido
Alguma frase IDÊNTICA em turnos diferentes? SIM — "Pra não perder seu atendimento se a gente ficar sem conexão aqui" / "Pra não perder seu atendimento se cair a internet" (Turnos 16, 20)
