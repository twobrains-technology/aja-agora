# auto — canal web — Madalena
conversationId: 58E5F37C-A441-454E-9532-86B2020B7C02

## Turno 1
USUÁRIO: quero um Corolla
AGENTE: Te conectando com Rafael, especialista em Automóvel. Show, Corolla é um clássico! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Madalena
AGENTE: Beleza, Madalena. Qual carro você tem em mente?

## Turno 3
USUÁRIO: Corolla
AGENTE: Perfeito, o Corolla já está anotado. E o que fez você decidir agora por um carro novo?

## Turno 4
USUÁRIO: Carro na oficina
AGENTE: Entendo bem — quando o carro dá trabalho, atrapalha tudo. Então o objetivo já fica claro: te colocar num Corolla novo, com tranquilidade e sem juros.

## Turno 5
USUÁRIO: beleza
AGENTE: Quanto custa o Corolla que você tem em mente?
GATE: credit

## Turno 6
USUÁRIO: uns 150 mil
AGENTE: Boa, 150 mil então. Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e celular.
GATE: identify

## Turno 7
USUÁRIO: [CPF: 02874137138 | Celular: 5562992496793 | LGPD: true]
AGENTE: Encontramos 23 boas opções na sua faixa! Olha só o que a gente consegue pra você: Escolhe uma pra simular e ver os números completos. Você já fez consórcio antes?
CARDS: comparison_table
GATE: experience

## Turno 8
USUÁRIO: [primeira vez]
AGENTE: Show, primeira vez é com a gente! Resumindo: consórcio funciona assim — você entra num grupo de pessoas que pagam parcela mensal, sem juros, só taxa de administração. A cada mês tem uma assembleia e alguém do grupo é contemplado por sorteio ou lance, recebendo a carta de crédito, que é o valor que você usa pra comprar o Corolla. Bem diferente de financiamento, que cobra juros e libera o crédito na hora. Nosso trabalho aqui é vasculhar as melhores administradoras e trazer pra você o grupo que mais faz sentido — parcela que cabe no seu bolso e chance real de contemplação no prazo que você quer. Bora ver as opções?
CARDS: topic_picker

## Turno 9
USUÁRIO: tá bom, quero
AGENTE: Em quanto tempo você quer estar com o carro novo?

## Turno 10
USUÁRIO: uns 3 anos
AGENTE: Anotado — 3 anos. Você teria como dar um lance pra antecipar a contemplação e ficar com o carro mais rápido?
GATE: lance

## Turno 11
USUÁRIO: [sim]
AGENTE: Show, com lance dá pra antecipar bastante a contemplação. A melhor opção pra seu perfil é o **ITAÚ** — parcela de R$ 3.549,75 por mês durante 50 meses. Com um lance de R$ 102.135,00 você consegue ser contemplado em torno de 6 meses. Quer ver como ficaria em outro prazo, ou prefere explorar outras opções?
CARDS: simulation_result

## Turno 12 — TESTE "não entendi"
USUÁRIO: não entendi
AGENTE: Deixa eu explicar de um jeito mais claro. Você vai pagar R$ 3.549,75 todo mês. Esse dinheiro entra num "pote" coletivo com outras pessoas. A cada mês tem um sorteio — quem ganha, recebe o valor total da carta (R$ 150.000) pra comprar o Corolla. Agora, se você quiser pegar o carro MAIS RÁPIDO (em vez de esperar o sorteio), você dá um lance — é tipo um "extra" que aumenta suas chances de ganhar mais cedo. Nesse caso, uns R$ 102 mil em dinheiro agora, e você sairia com o Corolla em aproximadamente 6 meses. Faz sentido?
RESPOSTA: clara e detalhada ✓

## Turno 13 — TESTE "Bradesco"
USUÁRIO: vocês têm Bradesco?
AGENTE: Mas trouxe outras bem fortes — ITAÚ, BANCO DO BRASIL, RODOBENS, CANOPUS e ÂNCORA. A ITAÚ que mostrei é a mais alinhada com seu perfil e prazo. Quer que eu simule a Rodobens ou o Banco do Brasil pra você comparar?
RESPOSTA: Não mencionou Bradesco especificamente, mas ofereceu alternativas ✓

## Turno 14
USUÁRIO: pode ser
AGENTE: Vou considerar um lance de R$ 30.000 por enquanto — você pode ajustar depois. Agora vou simular a Rodobens com R$ 150.000 e um lance de R$ 30.000: Olha só a Rodobens: Aqui tá a Rodobens — parcela bem menor que a ITAÚ (R$ 2.025,62 versus R$ 3.549,75), mas o prazo é mais longo (96 meses em vez de 50). Com um lance de aproximadamente R$ 78.900, você sai com o Corolla em torno de 6 meses também. Qual faz mais sentido pra você — parcela menor e prazo mais comprido, ou parcela maior e sai mais rápido?

## Turno 15
USUÁRIO: prefiro a primeira, 50 meses é bom
AGENTE: Perfeito, então a ITAÚ é a sua opção. Funciona assim: em vez de ter R$ 102.135 em dinheiro hoje, você coloca até 30% da carta (uns R$ 45 mil) como lance automático — aí você recebe menos crédito agora (R$ 105 mil em vez de R$ 150 mil), mas a parcela fica menor depois da contemplação. Faz sentido considerar isso?
CARDS: embedded_bid
GATE: lance-embutido

## Turno 16
USUÁRIO: [sim]
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
GATE: simulator-offer

## Turno 17
USUÁRIO: [sim, quero ver]
AGENTE: Dá pra ver bem aqui quando você consegue ser contemplado e quanto precisa de lance pra cada prazo: Mexe na agulha e vê quanto precisa de lance em cada cenário — 3 meses, 6 meses, 1 ano, o que quiser. Ah, e um detalhe — esse grupo da ITAÚ tá com demanda alta agora, então as vagas são limitadas. Mas se você quer seguir, a gente fecha sua reserva direto. Boa! Então deixa eu confirmar com você — esse plano da ITAÚ com 50 meses encaixa bem no que você pediu.
CARDS: contemplation_dial, scarcity, decision_prompt

## Turno 18
USUÁRIO: quero sim
AGENTE: Pra confirmar sua reserva, só preciso de uns dados rápidos. Se acontecer algo aqui, continuamos por lá sem interrupção. Pra garantir que a gente não perde seu atendimento se cair a internet, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin

## Turno 19
USUÁRIO: 5562992496793
AGENTE: Anotado. Agora é só confirmar a reserva com seus dados pessoais.
CARDS: contract_form

## Turno 20
USUÁRIO: tá bom, confirma
AGENTE: Ótimo, Madalena! Pra finalizar a reserva, preciso do seu CPF e confirmar o celular — isso libera a proposta real com a ITAÚ.
CARDS: contract_form

## Turno 21
USUÁRIO: [CPF: 02874137138 | Celular: 5562992496793 | LGPD: true]
AGENTE: (sem texto — processando)

## Turno 22
USUÁRIO: ok
AGENTE: Perfeito! Sua reserva foi confirmada com a ITAÚ. Agora a administradora vai processar sua proposta — você vai receber a carta de crédito com os números finais (parcela, taxa, tudo certinho) pra assinar. A gente segue junto até você ser contemplado e pegar o Corolla novo. Qualquer dúvida, é só chamar!

## Fim
Chegou até: Reserva confirmada com ITAÚ (fim da jornada)
Apareceu "Acho que me perdi"? Não
Algum card saiu DUPLICADO no mesmo turno? Sim — contract_form apareceu 3 vezes (turnos 18, 19, 20)
Alguma frase IDÊNTICA em turnos diferentes? Não
Pediu consentimento antes de dar os números da recomendada? Sim — gate identify (turno 7)
