# moto — canal web — Mario

conversationId: 9AD306F0-4CA5-4DF5-B662-70AC817757C2

## Turno 1
USUÁRIO: Quero uma moto pra delivery
AGENTE: Te conectando com Bruno, especialista em Moto. Um momento ⏳ Show, moto para delivery é uma jogada inteligente! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Mario
AGENTE: Beleza, Mario. Qual moto você tem em mente?

## Turno 3
USUÁRIO: Uma moto média, pra delivery
AGENTE: Entendo bem — quando você tem uma moto confiável, o trabalho flui melhor. Então o objetivo já fica claro: te colocar numa moto média, com tranquilidade e sem juros. E quanto custa essa moto hoje?
GATE: credit

## Turno 4
USUÁRIO: Em torno de 35 mil reais
AGENTE: Boa, 35 mil então. Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e celular.
GATE: identify

## Turno 5
USUÁRIO: [CPF de teste], [celular de teste], LGPD aceito
AGENTE: Ótimo, Mario — encontramos 4 opções na sua faixa. Bora ver a que melhor encaixa no seu perfil: Confere aí — as 4 opções com parcela, prazo e contemplação. Qual delas você quer simular pra ver os detalhes?
CARDS: comparison_table
GATE: experience

## Turno 6 — Teste "Não entendi"
USUÁRIO: Não entendi bem essas opções
AGENTE: Verdade, deixa eu simplificar pra você. Cada uma dessas motos custa em torno de 35 mil — o que muda é a administradora (quem gerencia o consórcio), a parcela mensal que você paga, e quanto tempo leva pra você ser contemplado e receber a moto. Por exemplo: Qual administradora te interessa mais — a que tem parcela mais baixa, ou a que contempla mais rápido?

## Turno 7
USUÁRIO: Parcela mais baixa
AGENTE: Perfeito. Vou simular a opção com a menor parcela pra você: se você quiser antecipar a contemplação com um lance, chegaria em torno de 6 meses. Faz sentido pra você?

## Turno 8
USUÁRIO: Não tenho entrada pra dar de lance agora
AGENTE: Tranquilo, Mario. Sem lance você segue só com a parcela mensal — a contemplação pode demorar um pouco mais, mas funciona normal. Deixa eu simular a opção com a parcela mais baixa pra você ver os números reais. Sem lance, você segue esse ritmo até ser contemplado — pode levar mais tempo, mas é tranquilo. Se mudar de ideia e quiser dar um lance depois, a carta pode virar R$ 24.500 na hora (usando R$ 10.500 como lance embutido) e você seria contemplado em torno de 6 meses. Quer explorar isso ou prefere seguir com a parcela baixa mesmo?
GATE: experience

## Turno 9
USUÁRIO: Prefiro seguir só com a parcela baixa
AGENTE: Certo, Mario. Pronto, Mario — olha só que bacana: Se você quiser acelerar e der um lance depois, consegue contemplação em torno de 6 meses. Faz sentido?
GATE: experience

## Turno 10
USUÁRIO: Sim, faz sentido
AGENTE: Show! Então a gente segue com essa opção — parcela baixa agora, e se bater vontade de acelerar com um lance, você me avisa. Quer que eu detalhe melhor como funciona essa contemplação com lance, ou já bora pro próximo passo?
GATE: experience

## Turno 11
USUÁRIO: Bora pro próximo passo
AGENTE: Perfeito, Mario. Assim se cair a internet ou você sair daqui, a gente continua a conversa por lá sem perder nada do atendimento. Posso anotar seu WhatsApp?
GATE: experience

## Turno 12
USUÁRIO: Sim, pode anotar
AGENTE: Ótimo! Qual é o número?
GATE: experience

## Turno 13
USUÁRIO: [celular de teste]
AGENTE: Anotado, Mario! A gente segue por aqui e também fico de olho no seu WhatsApp. Bora finalizar sua proposta então — clica em "Tenho interesse" que a gente fecha tudo certo.

## Turno 14
USUÁRIO: Tenho interesse
AGENTE: Excelente, Mario! Sua proposta está sendo criada com a administradora agora. Em poucos minutos você recebe os detalhes completos por aqui e pelo WhatsApp — aí é só assinar e pronto, a moto é sua! Quer que eu fique de olho em tudo ou já tá tranquilo?
GATE: experience

## Turno 15
USUÁRIO: Já tá tranquilo, obrigado
AGENTE: De nada, Mario! Qualquer dúvida que surgir, é só chamar. Boa sorte com a moto e com o delivery! Você já fez consórcio antes?
GATE: experience

## Turno 16
USUÁRIO: Não, é meu primeiro
AGENTE: Ah, Mario — primeira vez com consórcio, então! Resumindo o essencial: consórcio é um grupo de pessoas que pagam parcelas mensais juntas, sem juros. A cada mês tem uma assembleia e alguém é contemplado — pode ser você por sorteio ou se você der um lance (oferecer um valor extra pra ficar na sua vez). Bem diferente de financiamento, que tem juros e o dinheiro sai na hora. Aqui você paga só a taxa de administração — fica bem mais em conta. Sua proposta já tá rodando, então relaxa que a gente cuida de tudo!
CARDS: topic_picker

## Fim
Chegou até: Proposta criada, agente pediu para finalizar
Apareceu "Acho que me perdi"? Não
Apareceu "as opções que já apareceram continuam valendo"? Não
Ele entregou parcela/administradora da recomendada ANTES do consentimento? Parcialmente — Turno 7 ofereceu "parcela com menor valor" mas sem valores específicos até o teste
Alguma frase IDÊNTICA em turnos diferentes? Não — Turno 7 e 9 repetiram "Faz sentido?" mas com contextos diferentes

## Nota operacional
Fluxo confuso com GATE experience repetido; proposta criada antes de confirmação final clara; pergunta "Você já fez consórcio antes?" apareceu APÓS a jornada quase completa (Turno 15). Não conseguimos testar "Bradesco" pois o fluxo era mais direto (4 opções pré-selecionadas).
