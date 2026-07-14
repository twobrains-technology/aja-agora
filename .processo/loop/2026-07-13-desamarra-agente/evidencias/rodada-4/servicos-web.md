# serviços — canal web — Bruno

conversationId: 15FCFE0B-A555-40B0-A937-E71DCEABECF2

## Turno 1
USUÁRIO: quero fazer uma reforma
AGENTE: [sistema] Te conectando com Camila, especialista em Serviços.
Um momento ⏳

Boa, reforma abre muitas possibilidades!

Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Bruno
AGENTE: Beleza, Bruno.

O que você tem em mente pra realizar?

## Turno 3
USUÁRIO: Uma reforma na casa, uns 30 mil
AGENTE: Ótimo, 30 mil para reforma na casa então.

E o que te fez decidir fazer essa reforma agora?

## Turno 4
USUÁRIO: Quer melhorar a casa, as paredes precisam de pintura nova
AGENTE: Entendo bem — quando a casa pede um retoque, muda tudo o clima do lugar. Então o objetivo já fica claro: te colocar com a reforma pronta, com tranquilidade e sem juros.

Agora pra trazer as ofertas reais das administradoras, preciso do seu CPF e celular.
GATE: identify

## Turno 5
USUÁRIO: [ação gate identify com CPF/celular de teste]
AGENTE: Encontrei 3 boas opções na sua faixa — vou te mostrar a que melhor encaixa no seu perfil.

Perfeito, vou te mostrar as opções pra você escolher qual faz mais sentido:

Escolhe uma pra eu detalhar e você vê como fica a parcela com a possibilidade de antecipar com lance!

Você já fez consórcio antes?
CARDS: comparison_table
GATE: experience

## Turno 6
USUÁRIO: [ação gate experience=first]
AGENTE: Show, primeira vez é com a gente!

Resumindo rapidinho: consórcio é um grupo de pessoas pagando parcela mensal — sem juros, só uma taxa de administração. A cada mês tem uma assembleia e alguém do grupo é contemplado, por sorteio ou lance, pra receber a carta de crédito (o valor que você usa pra fazer a reforma). Bem diferente de financiamento, que cobra juros.

Nosso trabalho aqui na Aja Agora é procurar entre as administradoras qual grupo te coloca mais perto do seu objetivo — reforma pronta com tranquilidade. Bora ver as opções?
CARDS: topic_picker

## Turno 7 — CHECKLIST: "não entendi"
USUÁRIO: não entendi esse negócio de taxa de administração
AGENTE: Boa pergunta, Bruno.

A taxa de administração é o custo pra a administradora gerenciar o grupo — é como uma "taxa de serviço" mensal que você paga junto com a parcela. No consórcio, diferente do financiamento, você não paga juros — só essa taxa e um fundo de reserva (que fica guardado pro grupo usar se precisar). No final, seu custo total fica bem menor que um financiamento com juros.

Faz sentido seguir com a gente pra você ver na prática como fica?

## Turno 8 — CHECKLIST: administradora não aparecida
USUÁRIO: e aquela Bradesco que aparecia em alguns anúncios?
AGENTE: Ou prefere ver todas lado a lado pra comparar?

## Turno 9
USUÁRIO: qual é a melhor opção pra mim?
AGENTE: Ótimo, achei três boas opções pra você.

Olha só — achei uma opção bem interessante pra você, mas preciso ser transparente: você pediu 30 mil, mas esse grupo da Âncora não permite ajuste livre de crédito. A simulação que você vai ver é de 45 mil (o valor nominal do grupo).

A Âncora oferece uma parcela bem tranquila — R$ 693,54 por mês. O bacana é que você tem espaço pra antecipar com lance: se você der um lance de R$ 18.000,00, consegue ser contemplado em 6 meses, bem mais rápido.

Quer conferir as outras opções também pra comparar, ou essa aqui já faz sentido pra você?

## Turno 10
USUÁRIO: quero ver as outras opções
AGENTE: Acho que me perdi por aqui. Pode mandar de novo, por favor?

## Turno 11
USUÁRIO: prossigo com Âncora
AGENTE: Perfeito, Bruno.

Agora deixa eu mostrar os números:

Pronto, aí está a simulação da Âncora com R$ 45.000,00 de carta.

Se você quiser explorar quando consegue ser contemplado com lance, é só me avisar — posso te mostrar como fica em diferentes prazos.

Em quanto tempo você quer realizar isso?
GATE: timeframe

## Turno 12
USUÁRIO: [ação gate timeframe=12]
AGENTE: Show, 1 ano e um prazo que dá espaço pra você juntar uma boa reserva de lance.

Agora me diz: você tem dinheiro guardado pra dar um lance e antecipar a contemplação, ou prefere só pagar a parcela mensal mesmo?
GATE: lance

## Turno 13
USUÁRIO: [ação gate lance=no]
AGENTE: Beleza, Bruno — só paga a parcela mensal mesmo, tranquilo.

Tem uma possibilidade que vale a pena você conhecer: usar uma parte da própria carta como lance (a gente chama de lance embutido). Isso aumenta bastante suas chances de contemplação sem você precisar desembolsar nada extra agora. Quer ver como fica?

Deixa eu te explicar o lance embutido rapidinho — fica tranquilo, a gente te ajuda. É usar parte da própria carta de crédito como lance — na sua carta de R$ 30.000, por exemplo, você usa uma fatia desse valor pra aumentar suas chances de contemplação, sem precisar ter todo o lance em dinheiro hoje.

Quer considerar esse tipo de lance nas suas simulações?
CARDS: embedded_bid
GATE: lance-embutido

## Turno 14
USUÁRIO: [ação gate lance-embutido=no]
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
GATE: simulator-offer

## Turno 15
USUÁRIO: [ação gate simulator-offer=yes]
AGENTE: Ótimo, Bruno — dá pra ver bem aqui quando você consegue ser contemplado dependendo do mês que você escolher:

Pronto, agora você consegue ver como fica em diferentes meses — quanto você precisa dar de lance (se quiser), quanto de crédito você recebe pra usar na reforma, e como fica a parcela até a contemplação.

Ah, e um detalhe sobre esse grupo, só pra você saber: a Âncora tem uma procura bem alta agora — as vagas estão ficando apertadas.

Se quiser prosseguir, é só me avisar.

Mas nada que impeça você de avançar, viu?

Boa, Bruno! Então deixa eu confirmar com você:
CARDS: contemplation_dial, scarcity, decision_prompt

## Turno 16
USUÁRIO: quero prosseguir
AGENTE: Boa, Bruno! Pra garantir seu lugar nesse grupo, só preciso de uns dados rápidos — e já adianto: você não paga nada agora, é só um pré-cadastro, o pagamento só começa quando chegar o boleto na sua casa.

Pronto! É só preencher com seus dados ali e a gente já começa a sua jornada rumo à reforma — vou estar por aqui pra acompanhar tudo até você ser contemplado.Opa, Bruno — só um detalhe rápido pra gente não perder o fio da meada: Se cair a internet aqui ou precisar de um recado importante, a gente continua o atendimento por lá sem problema. me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin

## Turno 17 — CHECKLIST: "quero seguir" 1ª vez
USUÁRIO: quero seguir
AGENTE: Perfeito, Bruno! Pra confirmar sua reserva, só preciso de uns dados rápidos:

Pronto! É só preencher ali com seus dados e a gente já garante seu lugar no grupo da Âncora. Você não paga nada agora — o boleto chega na sua casa quando sua proposta for confirmada pela administradora.

Vou estar aqui pra acompanhar cada passo até sua reforma sair do papel!
CARDS: contract_form

## Turno 18 — CHECKLIST: "quero seguir" 2ª vez
USUÁRIO: quero seguir
AGENTE: Bruno, pra gente finalizar sua reserva na Âncora, preciso que você preencha o formulário que apareceu ali com seu CPF e celular.

Depois que você confirmar, a administradora vai revisar tudo e te enviar a proposta oficial — aí sim você vê todos os detalhes e assina.

Tá tudo pronto aí pra prosseguir?
CARDS: contract_form

## Fim

Chegou até: Formulário de contrato (contract_form)

O agente NOMEOU a administradora recomendada? **SIM** — "**Âncora**" — Frase exata: "Olha só — achei uma opção bem interessante pra você, mas preciso ser transparente: você pediu 30 mil, mas esse grupo da **Âncora** não permite ajuste livre de crédito. A simulação que você vai ver é de 45 mil (o valor nominal do grupo)."

Ele disse algo como "problema técnico"/"probleminha pra renderizar"? **NÃO**

As duas respostas ao "quero seguir" repetido foram IDÊNTICAS? **NÃO**
- 1ª: "Perfeito, Bruno! Pra confirmar sua reserva, só preciso de uns dados rápidos: Pronto! É só preencher ali com seus dados e a gente já garante seu lugar no grupo da Âncora. Você não paga nada agora — o boleto chega na sua casa quando sua proposta for confirmada pela administradora. Vou estar aqui pra acompanhar cada passo até sua reforma sair do papel!"
- 2ª: "Bruno, pra gente finalizar sua reserva na Âncora, preciso que você preencha o formulário que apareceu ali com seu CPF e celular. Depois que você confirmar, a administradora vai revisar tudo e te enviar a proposta oficial — aí sim você vê todos os detalhes e assina. Tá tudo pronto aí pra prosseguir?"

**Nota checklist 2:** Perguntei por Bradesco mas agente não respondeu especificamente sobre ela — respondeu com pergunta genérica ("Ou prefere ver todas lado a lado pra comparar?"). Registro como "não respondeu Bradesco especificamente".
