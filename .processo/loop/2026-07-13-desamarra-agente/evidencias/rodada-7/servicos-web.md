# servicos — canal web — Bruno
conversationId: 457B33EE-FA90-40C2-9DEB-413320EC87F7

## Turno 1
USUÁRIO: quero fazer uma reforma
AGENTE: Te conectando com Camila, especialista em Serviços. Boa, reforma é um projeto bacana! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Bruno
AGENTE: Perfeito, Bruno. O que você tem em mente pra realizar?

## Turno 3
USUÁRIO: cozinha e banheiro
AGENTE: Show, cozinha e banheiro — essas duas já fazem uma diferença grande na casa. E o que fez você decidir fazer essa reforma agora?

## Turno 4
USUÁRIO: estão muito velhos
AGENTE: Entendo bem — quando as coisas ficam muito velhas, chegam a afetar até o dia a dia mesmo. Então o objetivo já fica claro: colocar uma cozinha e banheiro novos, com qualidade e conforto. Tem uma ideia de quanto você quer investir nessa reforma?

## Turno 5
USUÁRIO: uns 30 mil
AGENTE: Boa, 30 mil então. Pra trazer as ofertas reais das administradoras, preciso do seu CPF e celular. Qual seu CPF?
GATE: identify

## Turno 6
USUÁRIO: [CPF: 02874137138 | Celular: 5562992496793 | LGPD: true]
AGENTE: Ótimo, encontramos 3 boas opções pra sua reforma. Bora ver qual combina melhor com você: Agora deixa eu te mostrar as 3 opções em detalhes pra você escolher: Qual delas você gostaria de simular pra ver os números exatos?
CARDS: comparison_table
GATE: experience

## Turno 7
USUÁRIO: [primeira vez]
AGENTE: Show, primeira vez é com a gente! Deixa eu explicar rápido como funciona. Consórcio é um grupo de pessoas que junta parcela mensal — e aqui vem o detalhe legal: *sem juros*. A cada mês, alguém do grupo é contemplado por sorteio ou lance e recebe a carta de crédito, que é o valor que você usa pra fazer a reforma. É bem diferente de financiamento, que tem juros e o crédito sai na hora. Aqui você paga só uma taxa de administração e aguarda a contemplação. Meu papel é encontrar entre as administradoras aquele grupo que tem mais chances de te contemplar no tempo que faz sentido pra você — e com parcela que cabe no seu bolso. Bora nessa?
CARDS: topic_picker

## Turno 8
USUÁRIO: tá bom, quero
AGENTE: Em quanto tempo você quer realizar isso?

## Turno 9
USUÁRIO: uns 2 anos
AGENTE: Perfeito, 2 anos te deixa com bastante flexibilidade. Você tem uma reserva pra dar um lance e antecipar a contemplação, ou prefere contar só com o sorteio?
GATE: lance

## Turno 10
USUÁRIO: [não, só sorteio]
AGENTE: Tranquilo, Bruno. Só sorteio também funciona bem — com 2 anos você tem tempo pra contemplação acontecer naturalmente. Olha só o que a gente consegue na sua faixa: As 3 opções que encontramos têm características bem diferentes — uma parcela mais baixa e prazo longo, outra mais rápida, e uma do meio. Qual delas você quer explorar primeiro pra ver os números exatos? Deixa eu te explicar o lance embutido rapidinho — fica tranquilo, a gente te ajuda. É usar parte da própria carta de crédito como lance — numa carta de R$ 100 mil, por exemplo, você usa uma fatia desse valor pra aumentar suas chances de contemplação, sem precisar ter todo o lance em dinheiro hoje. Quer considerar esse tipo de lance nas suas simulações?
CARDS: embedded_bid
GATE: lance-embutido

## Turno 11
USUÁRIO: [não]
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
GATE: simulator-offer

## Turno 12
USUÁRIO: [sim, quero ver]
AGENTE: Aqui você vê em tempo real quanto você precisaria de lance (em dinheiro) pra conseguir ser contemplado em cada mês — sem forçar nada, tudo estimado baseado no histórico do grupo. Ah, e um detalhe importante sobre esse grupo, só pra você saber: Boa, Bruno! Então deixa eu confirmar com você:
CARDS: contemplation_dial, decision_prompt

## Turno 13 — TESTE "não entendi"
USUÁRIO: não entendi
AGENTE: Deixa eu simplificar, Bruno. A gente tem 3 administradoras diferentes oferecendo consórcio pra sua reforma de 30 mil. Cada uma tem uma parcela mensal diferente e um prazo diferente até você receber o dinheiro. Qual das 3 você quer que eu mostre os números exatos — parcela, prazo, tudo direitinho — pra você ver qual faz mais sentido no seu bolso?
RESPOSTA: clara e simplificada ✓

## Turno 14 — TESTE "Bradesco"
USUÁRIO: vocês têm Bradesco?
AGENTE: As que a gente tem são: **ÂNCORA**, **TRADIÇÃO** e **RODOBENS** — todas com grupos ativos e boas chances de contemplação. Qual delas você quer que eu simule pra você ver a parcela e o prazo certinhos?
RESPOSTA: Não mencionou Bradesco, listou as opções reais ✓

## Turno 15
USUÁRIO: TRADIÇÃO
AGENTE: Perfeito! Olha aqui os números da **TRADIÇÃO** pra você: A parcela fica em **R$ 839,67 por mês** durante 46 meses — bem tranquilo no seu bolso. O bacana é que esse grupo tem histórico forte de contemplação: se você quisesse antecipar (dando um lance em dinheiro), poderia estar contemplado em torno de **6 meses**. Mas sem pressa, em 2 anos você tem tempo de sobra pro sorteio acontecer. Esse plano faz sentido pra você?

## Turno 16
USUÁRIO: faz sim, é tranquilo
AGENTE: Boa! Então deixa eu confirmar com você: Pra confirmar sua reserva, só preciso de uns dados rápidos: CPF, celular e seu ok com os termos. Tá tudo aí acima — é rapidinho! Show, Bruno! Continuamos por lá sem problema nenhum. Pra gente não perder o fio da meada se cair a internet aqui, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin

## Turno 17
USUÁRIO: 5562992496793
AGENTE: Perfeito, anotado! Agora é só confirmar sua proposta com a **TRADIÇÃO** — os dados e os termos estão no formulário acima. Depois que você enviar, a gente segue junto até você ser contemplado e realizar sua reforma!

## Turno 18
USUÁRIO: [CPF: 02874137138 | Celular: 5562992496793 | LGPD: true]
AGENTE: (sem texto — processando)

## Turno 19
USUÁRIO: pronto?
AGENTE: Ótimo, Bruno! Sua proposta foi registrada com a **TRADIÇÃO**. Agora a administradora vai analisar tudo e você já pode acompanhar o status dela por aqui. Em breve você recebe a documentação pra assinar e já entra no grupo oficial. A gente segue junto até você ser contemplado — qualquer dúvida ou novidade, é só chamar!

## Fim
Chegou até: Reserva confirmada com TRADIÇÃO (fim da jornada)
Apareceu "Acho que me perdi"? Não
Algum card saiu DUPLICADO no mesmo turno? Não
Alguma frase IDÊNTICA em turnos diferentes? Sim — "Pra gente não perder o fio da meada se cair a internet aqui" (Turno 16) vs estrutura similar anterior
Pediu consentimento antes de dar os números da recomendada? Sim — gate identify (turno 6)
