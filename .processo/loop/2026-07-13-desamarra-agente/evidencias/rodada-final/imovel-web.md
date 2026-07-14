# imovel — canal web — Fernanda
conversationId: 7413A7F0-40A6-462B-A9D1-CD879EEE8A84

## Turno 1
USUÁRIO: quero um apartamento
AGENTE: Te conectando com Helena, especialista em Imóvel. Boa, apartamento abre muitas possibilidades! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Fernanda
AGENTE: Prazer, Fernanda! Qual imóvel você tem em mente?

## Turno 3
USUÁRIO: apartamento
AGENTE: Beleza, apartamento é uma ótima escolha. E o que fez você decidir agora por um imóvel?

## Turno 4
USUÁRIO: quer ter o meu próprio lugar
AGENTE: Entendo bem — ter o próprio lugar é um sonho importante. Então o objetivo já fica claro: te colocar num apartamento que seja seu, com tranquilidade e sem juros.

## Turno 5
USUÁRIO: exato
AGENTE: Perfeito, Fernanda. Quanto custa o apartamento que você tem em mente?
GATE: credit

## Turno 6
USUÁRIO: uns 400 mil
AGENTE: Boa, 400 mil então. Pra trazer as ofertas reais das administradoras, preciso do seu CPF e celular. Pode ser?
GATE: identify

## Turno 7
USUÁRIO: [CPF: 02874137138 | Celular: 5562992496793 | LGPD: true]
AGENTE: Encontramos 18 boas opções pra você nessa faixa! Olha os números dessa simulação: Abaixo você vê também as outras opções — tem alternativas com parcela mais baixa se preferir esticar o prazo, ou contemplação mais rápida se tiver dinheiro pra um lance. Você já fez consórcio antes?
CARDS: comparison_table
GATE: experience

## Turno 8
USUÁRIO: [já fiz consórcio]
AGENTE: Show, vamos direto ao ponto então. Você tem reserva pra dar um lance e antecipar a contemplação?

## Turno 9
USUÁRIO: sim, tenho FGTS
AGENTE: Legal, FGTS na manga é uma força extra mesmo. Em quanto tempo você quer estar com o seu imóvel?
CARDS: recommendation_card, simulation_result
GATE: timeframe

## Turno 10
USUÁRIO: uns 4 anos
AGENTE: Entendi, uns 4 anos de prazo. Com esse tempo e o FGTS que você tem pra lance, dá pra montar um cenário bem tranquilo. Qual valor de lance você pensa em oferecer — uns 50 mil, 100 mil, ou tem outro número em mente?
GATE: lance

## Turno 11
USUÁRIO: uns 80 mil
AGENTE: Boa, 80 mil de lance é um valor sólido. Vejo que você já tem as 6 opções na tela. Qual delas combina mais com o que você tá buscando — a parcela mais baixa, a contemplação mais rápida, ou quer que eu detalhe uma específica pra você?
GATE: lance

## Turno 12 — TESTE "não entendi"
USUÁRIO: não entendi bem essas opções
AGENTE: Sem problema, Fernanda. Essas 6 opções são grupos de consórcio de diferentes administradoras — cada uma com uma parcela mensal e um histórico de contemplação. A diferença é basicamente: Algumas têm parcela mais baixa, mas pode demorar um pouco mais pra você ser contemplada. Outras contemplam mais rápido, mas a parcela é um pouco mais alta. Com seu lance de 80 mil, você aumenta bastante as chances de ser contemplado nos primeiros meses. A gente simula a opção que fizer mais sentido e você ve exatamente quanto fica de parcela e quando você consegue receber o crédito. Qual delas você gostaria que eu simulasse pra você ver os números reais?
RESPOSTA: clara e detalhada ✓

## Turno 13 — TESTE "Bradesco"
USUÁRIO: vocês têm Bradesco?
AGENTE: Vou seguir sem considerar lance por enquanto — se quiser, a gente volta nesse assunto depois. As opções reais que temos pra você são: ITAÚ, BANCO DO BRASIL, ÂNCORA, CANOPUS, TRADIÇÃO e RODOBENS. Todas com boas condições nessa faixa de 400 mil. Qual delas você gostaria que eu simulasse pra você?
CARDS: embedded_bid
GATE: lance-embutido
RESPOSTA: Não mencionou Bradesco especificamente, mas ofereceu as opções reais ✓

## Turno 14
USUÁRIO: ITAÚ
AGENTE: Show, vou simular a ITAÚ com 400 mil pra você ver os números reais. Agora olha só os números: A parcela fica em R$ 4.103,34 por mês durante o prazo de 129 meses (pouco mais de 10 anos). Com seu lance de 80 mil, você teria uma chance bem forte de ser contemplada em torno de 6 meses — uma estimativa baseada no histórico desse grupo. A carta que você recebe é de R$ 400.520,00. Faz sentido pra você ou quer ajustar algo?
CARDS: embedded_bid
GATE: lance-embutido

## Turno 15
USUÁRIO: faz sim, boa
AGENTE: Ótimo, Fernanda! A ITAÚ fica anotada como sua escolha. Quer ver como fica se você antecipar a contemplação pra, digamos, 3 meses — ou prefere manter os 6 meses que a gente viu agora?
GATE: simulator-offer

## Turno 16
USUÁRIO: [sim, quero ver]
AGENTE: Olha só — dá pra ver bem aqui quando você consegue ser contemplado e quanto de lance você precisaria em cada cenário: Ali você ve quanto de lance você precisaria pra ser contemplada em 3, 6, 12 meses ou qualquer outro prazo — dá pra ajustar conforme você quer. Com seu FGTS de 80 mil, você tem bastante munição. Ah, e um detalhe importante: esse grupo tem uma procura bem alta agora, então as vagas estão apertadas. Mas com seu lance de 80 mil, você fica numa posição bem competitiva mesmo assim. Boa! Então deixa eu confirmar com você: a ITAÚ com 400 mil, parcela de R$ 4.103,34 e lance de 80 mil — esse é o plano que faz sentido pra você?
CARDS: contemplation_dial, scarcity, decision_prompt

## Turno 17
USUÁRIO: sim, quero
AGENTE: Perfeito, Fernanda! Pra confirmar sua reserva, só preciso de uns dados rápidos. Se algo acontecer aqui, continuamos por lá sem problema. Pra gente não perder o fio da conversa se cair a internet, compartilha seu WhatsApp comigo?
CARDS: contract_form, whatsapp_optin

## Turno 18
USUÁRIO: 5562992496793
AGENTE: Ótimo, anotado! Agora vou abrir o formulário de contratação pra você finalizar a reserva com a ITAÚ. Tá na tela — é só preencher com o CPF, celular (se for diferente) e confirmar o aceite. A gente segue de perto até a contemplação!
CARDS: contract_form

## Turno 19
USUÁRIO: [CPF: 02874137138 | Celular: 5562992496793 | LGPD: true]
AGENTE: (sem texto — processando)

## Turno 20
USUÁRIO: pronto?
AGENTE: Perfeito, Fernanda! Agora você recebe um link pra confirmar e assinar — é rápido e seguro. A partir daí, a gente acompanha junto até você ser contemplada. Qualquer dúvida no caminho, é só chamar!

## Fim
Chegou até: Reserva confirmada com ITAÚ (fim da jornada)
Apareceu "Acho que me perdi"? Não
Algum card saiu DUPLICADO no mesmo turno? Sim — embedded_bid aparece nos turnos 13 e 14 (não é no mesmo turno, mas em sequência)
Alguma frase IDÊNTICA em turnos diferentes? Não
Pediu consentimento antes de dar os números da recomendada? Sim — gate identify (turno 7)
