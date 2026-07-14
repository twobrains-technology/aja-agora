# moto — canal web — Mario

conversationId: A0E30170-84C0-42A9-B505-70ED09276BAA

## Turno 1
USUÁRIO: quero uma moto
AGENTE: [sistema] Te conectando com Bruno, especialista em Moto.
Um momento ⏳

Boa, moto nova abre muitas possibilidades! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Mario
AGENTE: Beleza, Mario.

Qual moto você tem em mente?

## Turno 3
USUÁRIO: Uma moto pra fazer entregas, nova. Tô olhando uns modelos de 35 mil
AGENTE: Entendo bem — quando você quer trabalhar com a moto, precisa de uma que roda firme e confiável. Então o objetivo já fica claro: te colocar numa moto nova, com tranquilidade e sem juros.

Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e celular.
GATE: identify

## Turno 4
USUÁRIO: [ação gate identify com CPF/celular de teste]
AGENTE: Encontrei 4 opções boas na sua faixa. Dá uma olhada:

Escolhe uma pra simular e a gente aprofunda nos números.

Você já fez consórcio antes?
CARDS: comparison_table
GATE: experience

## Turno 5
USUÁRIO: [ação gate experience=first]
AGENTE: Show, Mario! Consórcio é assim: você entra num grupo de pessoas que pagam parcela mensal — sem juros, só taxa de administração. A cada assembleia, alguém do grupo é contemplado por sorteio ou oferecendo lance e recebe a carta de crédito, que é o dinheiro que você usa pra comprar a moto.

É bem diferente de financiamento, que cobra juros pesados desde o início. Aqui você só paga enquanto está no grupo, sem se endividar.

Nosso role aqui é procurar entre as administradoras o grupo que melhor cabe no seu bolso e que tem boas chances de contemplar você no prazo que você quer. Bora montar seu plano?
CARDS: topic_picker

## Turno 6 — CHECKLIST: "não entendi"
USUÁRIO: não entendi bem essa parte de contemplação por lance
AGENTE: Faz sentido ficar confuso mesmo.

Na assembleia mensal do grupo, tem dois jeitos de ser contemplado. O primeiro é o **sorteio** — a gente coloca todos os nomes na urna e sai um. Mas tem o **lance**, que é quando você oferece dinheiro extra pra ser contemplado naquele mês. Quem oferece o maior lance ganha a carta de crédito.

O legal é que você não precisa ter TODO aquele dinheiro do lance em mano hoje — uma parte pode vir da própria carta de crédito (o que a gente chama de *lance embutido*). Isso ajuda você a ser contemplado mais rápido, sem precisar desembolsar tudo em dinheiro.

A ideia é você escolher: quer tentar a sorte com o sorteio, ou preferir dar um lance pra acelerar a contemplação?

## Turno 7 — CHECKLIST: administradora não aparecida
USUÁRIO: e a Bradesco, que aparecia antes, não tem?
AGENTE: Mas olha o que a gente tem: Banco do Brasil, Tradição (com duas opções em prazos diferentes) e Canopus — todas com parcelamento tranquilo.

Qual dessas você quer que eu detalhe pra você ver a parcela exata e como fica com lance?

## Turno 8
USUÁRIO: qual é a melhor pra mim?
AGENTE: Pra você que quer rodar com entregas, a **Banco do Brasil** é a melhor opção agora.

Ela tem a parcela mais tranquila na sua faixa, contempla bastante pessoa por mês e roda bem. Quer que eu detalhe quanto fica de parcela mensal e como fica se você der um lance pra acelerar?

## Turno 9
USUÁRIO: sim, mostra pra mim
AGENTE: Acho que me perdi por aqui. Pode mandar de novo, por favor?

## Turno 10
USUÁRIO: quero prosseguir com Banco do Brasil
AGENTE: Perfeito, vou simular a Banco do Brasil com os R$ 35.738,00 pra você ver os números exatos.

Olha só:

Então fica assim: **R$ 3.240,25 por mês** durante 15 meses. Se você quiser antecipar a contemplação, precisa oferecer um lance — a estimativa é que com **R$ 3.659,57 de lance**, você consegue ser contemplado em torno de **6 meses**.

A boa notícia é que você pode usar a própria carta pra parte do lance (até 30%), então não precisa ter tudo em dinheiro hoje. Faz sentido esse caminho pra você?
GATE: timeframe

## Turno 11
USUÁRIO: [ação gate timeframe=24]
AGENTE: Tranquilo, 24 meses dá pra respirar e a parcela fica bem mais leve.

Você teria como dar um lance pra antecipar a contemplação?
GATE: lance

## Turno 12
USUÁRIO: [ação gate lance=no]
AGENTE: Entendi. Então a gente foca em deixar a parcela confortável pra você trabalhar com a moto.

Com 24 meses, sua parcela fica em **R$ 1.932,79 por mês** — muito melhor pro seu dia a dia de entregas. E se em algum momento você conseguir juntar uma grana e quiser antecipar, a gente conversa sobre lance. Topa seguir com esse plano?

Deixa eu te explicar o lance embutido rapidinho — fica tranquilo, a gente te ajuda. É usar parte da própria carta de crédito como lance — na sua carta de R$ 35.738, por exemplo, você usa uma fatia desse valor pra aumentar suas chances de contemplação, sem precisar ter todo o lance em dinheiro hoje.

Quer considerar esse tipo de lance nas suas simulações?
CARDS: embedded_bid
GATE: lance-embutido

## Turno 13
USUÁRIO: [ação gate lance-embutido=no]
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
GATE: simulator-offer

## Turno 14
USUÁRIO: [ação gate simulator-offer=yes]
AGENTE: Show, sem lance então a gente vê quando você consegue ser contemplado só com o sorteio.

Ah, e um detalhe: esse grupo tem menos vagas disponíveis agora, então a chance de ser contemplado pelo sorteio fica mais apertada.

Mas a gente consegue outras opções que respiram melhor — quer que eu traga as alternativas pra você comparar?

Boa! Então deixa eu confirmar com você: a Banco do Brasil com R$ 1.932,79 por mês durante 24 meses, sem lance. Isso fecha pra você?
CARDS: contemplation_dial, scarcity, decision_prompt

## Turno 15
USUÁRIO: sim, topa
AGENTE: Boa! Pra confirmar sua reserva, só preciso de uns dados rápidos.

Se acontecer algo aqui, continuamos por lá.

Pra não perder seu atendimento se cair a internet, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin

## Turno 16 — CHECKLIST: "quero seguir" 1ª vez
USUÁRIO: quero seguir
AGENTE: Perfeito, Mario! Só preciso de seus dados pra gerar a proposta com o Banco do Brasil.

Assim que você confirmar o formulário, sua proposta sai e a gente segue junto até você receber a moto.
CARDS: contract_form

## Turno 17 — CHECKLIST: "quero seguir" 2ª vez
USUÁRIO: quero seguir
AGENTE: Perfeito, Mario! Vou abrir o formulário com seus dados pra criar a proposta oficial com o Banco do Brasil.

Preenche rápido que a gente segue — depois é só confirmar e sua proposta tá criada.
CARDS: contract_form

## Fim

Chegou até: Formulário de contrato (contract_form)

O agente NOMEOU a administradora recomendada? **SIM** — "**Banco do Brasil**" — Frase exata: "Pra você que quer rodar com entregas, a **Banco do Brasil** é a melhor opção agora."

Ele disse algo como "problema técnico"/"probleminha pra renderizar"? **NÃO**

As duas respostas ao "quero seguir" repetido foram IDÊNTICAS? **NÃO**
- 1ª: "Perfeito, Mario! Só preciso de seus dados pra gerar a proposta com o Banco do Brasil. Assim que você confirmar o formulário, sua proposta sai e a gente segue junto até você receber a moto."
- 2ª: "Perfeito, Mario! Vou abrir o formulário com seus dados pra criar a proposta oficial com o Banco do Brasil. Preenche rápido que a gente segue — depois é só confirmar e sua proposta tá criada."
