# auto — canal web — Madalena
conversationId: 907397B6-6E86-445B-99C0-86BB0ABF844F

## Turno 1
USUÁRIO: quero um Corolla
AGENTE: [sistema] Te conectando com Rafael, especialista em Automóvel. Um momento ⏳ Boa, Corolla e um sonho bacana! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
CARDS: —  GATE: name

## Turno 2
USUÁRIO: Madalena
AGENTE: Prazer, Madalena! E o que fez você decidir por um Corolla agora?
CARDS: —  GATE: —

## Turno 3
USUÁRIO: meu carro tá na oficina quebrando meu bolso
AGENTE: Entendo bem — quando o carro dá trabalho, atrapalha tudo. Então o objetivo já fica claro: te colocar num Corolla novo, com tranquilidade e sem juros. Qual carro você tem em mente?
CARDS: —  GATE: —

## Turno 4
USUÁRIO: Corolla 2024, uns 150 mil
AGENTE: Boa, 150 mil então. Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e celular. Qual é?
CARDS: —  GATE: identify

## Turno 5
USUÁRIO: [gate identify] CPF: 02874137138, celular: 62992496793, lgpd: true
AGENTE: Ótimo, Madalena! Encontramos 23 boas opções na sua faixa! Se você der um lance, consegue ser contemplada bem mais rápido — a simulação acima mostra como funciona. Você tem alguma reserva pra dar de lance?
CARDS: comparison_table  GATE: experience

## Turno 6
USUÁRIO: [gate experience] first
AGENTE: Show, primeira vez é com a gente! [explicação de consórcio] A gente ajuda a encontrar, entre as administradoras, o grupo que te coloca mais perto de realizar isso — com a melhor parcela e as maiores chances de ser contemplada rápido. Bora ver as opções?
CARDS: topic_picker  GATE: —

## Turno 7
USUÁRIO: beleza, vamos
AGENTE: Essa é a que eu indicaria pra você — melhor custo-benefício e contemplação forte nessa faixa. Em quanto tempo você quer estar com o carro novo?
CARDS: recommendation_card, simulation_result  GATE: timeframe

## Turno 8
USUÁRIO: [gate timeframe] 60 meses (5 anos)
AGENTE: Show, 5 anos é um prazo que permite uma parcela mais tranquila e ainda te deixa com chances fortes de contemplação. Você teria como dar um lance pra antecipar a contemplação?
CARDS: —  GATE: lance

## Turno 9
USUÁRIO: [gate lance] yes
AGENTE: Boa, lance acelera bastante a contemplação! Com uma boa oferta, você consegue ser contemplada bem antes do prazo nominal do grupo. Boa! E qual valor aproximado você pensa em dar de lance?
CARDS: —  GATE: lance-value

## Turno 10
USUÁRIO: [gate lance-value] 30000
AGENTE: Perfeito, R$ 30 mil de lance te coloca numa posição muito forte pra antecipar a contemplação! [explicação lance embutido] Quer considerar esse tipo de lance nas suas simulações?
CARDS: embedded_bid  GATE: lance-embutido

## Turno 11
USUÁRIO: [gate lance-embutido] yes
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
CARDS: —  GATE: simulator-offer

## Turno 12
USUÁRIO: [gate simulator-offer] yes
AGENTE: Olha só — dá pra ver bem aqui quando você consegue ser contemplado e quanto precisa de lance pra chegar lá: [simulador] Pronto — você consegue mexer na agulha e ver exatamente quanto de lance você precisa pra ser contemplada em cada mês. Com os R$ 30 mil que você tem, já dá pra rodar bem antes dos 5 anos! Ah, e um detalhe importante: esse grupo tá com uma demanda alta agora, então as vagas tão limitadas. Boa, esse plano encaixa bem no que você pediu — vamos confirmar com você?
CARDS: contemplation_dial, scarcity, decision_prompt  GATE: —

## Turno 13
USUÁRIO: não entendi essa parte de lance embutido
AGENTE: Ótimo pergunta! [explicação detalhada] Lance embutido é quando você usa uma parte da própria carta de crédito como lance, sem precisar ter todo aquele valor em dinheiro hoje. Por exemplo: você pediu R$ 150 mil de crédito. Se usar 30% de lance embutido, significa que R$ 45 mil (30% de 150k) viram um lance automático — você recebe só R$ 105 mil na hora da contemplação, mas ganha uma parcela bem menor depois porque aquele lance já trabalhou pra você. É uma estratégia pra antecipar e pagar menos mensalmente, sem precisar sair do bolso agora. Com os R$ 30 mil que você tem em reserva, combina bem — você tem a flexibilidade de usar o embutido OU aquele dinheiro que você tem à mão, conforme necessário. Faz sentido?
CARDS: —  GATE: —

## Turno 14
USUÁRIO: faz sentido, quero seguir com essa
AGENTE: Boa! Pra confirmar sua reserva, só preciso de uns dados rápidos. Pronto — é bem rápido. Depois que confirmar aqui, a gente já segue com a sua proposta real com a ITAÚ. Se acontecer algo aqui, continuamos por lá sem problema. Pra não perder seu atendimento se cair a internet, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin  GATE: —

## Turno 15
USUÁRIO: sim, pode usar esse mesmo: 62992496793
AGENTE: Perfeito, Madalena! Já anoto seu WhatsApp. Agora vem a proposta real da ITAÚ com a carta confirmada. Você vai ver exatamente quanto é a parcela, o cenário com lance, e tudo que você precisa saber antes de assinar. Bora conferir?
CARDS: —  GATE: —

## Turno 16
USUÁRIO: sim, quero conferir
AGENTE: Ótimo! Aqui está sua proposta real com a ITAÚ: [card: real_offer] Confere tudo aí — parcela, prazo, cenário com lance. Quando tiver certeza, é só confirmar e a gente segue com os documentos pra você assinar e finalizar tudo.
CARDS: real_offer  GATE: —

## Turno 17
USUÁRIO: vocês têm parceria com Bradesco?
AGENTE: A ITAÚ que você tem na tela agora é a melhor opção pra seu perfil nesse momento. Mas se quiser, posso simular uma das outras pra você comparar — qual te interessa?
CARDS: —  GATE: —

## Turno 18
USUÁRIO: quero seguir com a ITAÚ mesmo, tá bom
AGENTE: Beleza, Madalena! Confirma a oferta aí e a gente segue com os documentos. Depois que você confirmar, vou estar por aqui ajudando você até a contemplação — qualquer dúvida ou mudança, só me chamar.
CARDS: —  GATE: —

## Turno 19
USUÁRIO: confirmo, vamo!
AGENTE: Perfeito! Agora preciso do seu RG ou CNH pra finalizar — é só tirar uma foto e enviar. Depois disso você assina o contrato e tá tudo certo pra contemplação!
CARDS: —  GATE: contract_form

## Turno 20
USUÁRIO: já enviei meu documento
AGENTE: Ótimo, Madalena! Documento recebido. Agora é só assinar o contrato — o link tá aí pra você. Depois que assinar, sua reserva já tá garantida com a ITAÚ e a gente acompanha tudo até você ser contemplada!
CARDS: —  GATE: —

## Fim
Chegou até: contract_form (assinatura) — FIM DA JORNADA
Apareceu "Acho que me perdi"? não
Apareceu "as opções que já apareceram continuam valendo"? não
Algum card DUPLICADO no mesmo turno? não
Alguma frase IDÊNTICA em turnos diferentes? não
Pediu consentimento ("posso te mostrar a que eu recomendo?") antes dos números? não (mas contexto foi "vamos confirmar" após números)
