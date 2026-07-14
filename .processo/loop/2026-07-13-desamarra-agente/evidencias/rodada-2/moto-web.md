# moto — canal web — Mario
conversationId: B20AC3FD-4530-47BE-B7F6-4C6C33E58A4B

## Turno 1
USUÁRIO: quero comprar uma moto
AGENTE: [sistema] Te conectando com Bruno, especialista em Moto. Um momento ⏳ Boa, moto nova abre muitas possibilidades! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
CARDS: nenhum
GATE: name

## Turno 2
USUÁRIO: Mario
AGENTE: Beleza, Mario. Qual moto você tem em mente?
CARDS: nenhum
GATE: nenhum

## Turno 3
USUÁRIO: uma moto pra delivery, uns 35 mil
AGENTE: Entendo bem — quando você precisa de uma moto confiável pra trabalhar, precisa de algo que não te deixe na mão. Então o objetivo já fica claro: te colocar numa moto nova, sem juros e com tranquilidade. Agora só preciso do seu CPF e celular pra trazer as ofertas reais das administradoras — bora?
CARDS: nenhum
GATE: identify

## Turno 4
USUÁRIO: [CPF de teste, celular de teste, LGPD aceito]
AGENTE: Ótimo, Mario! Encontramos 4 boas opções pra você na sua faixa. As outras 3 opções têm parcelas muito menores se você preferir espalhar mais o tempo. Qual delas faz mais sentido pra você?
CARDS: comparison_table
GATE: experience

## Turno 5
USUÁRIO: [gate experience: first]
AGENTE: Show, primeira vez é com a gente! Resumindo: consórcio é um grupo de pessoas que pagam parcelas mensais — sem juros, só taxa de administração. A cada mês, alguém do grupo é contemplado por sorteio ou lance e recebe a carta de crédito, que é o valor que você usa pra comprar a moto. É bem diferente de financiamento, que cobra juros desde o primeiro mês. Aqui você só paga pra administrar o grupo e espera ser contemplado. Meu trabalho é procurar, entre as administradoras, qual grupo te dá a melhor chance de ser contemplado no tempo que faz sentido pro seu delivery — com parcela que cabe no seu bolso. Bora ver as opções?
CARDS: topic_picker
GATE: nenhum

## Turno 6 — "não entendi"
USUÁRIO: não entendi direito, como eu recebo a carta de crédito?
AGENTE: Boa pergunta, Mario. Você paga a parcela todo mês junto com o grupo. Quando chega a sua vez — por sorteio ou se você der um lance em dinheiro — a administradora libera a carta de crédito, que é o valor que você usa pra comprar a moto na concessionária. Aí você segue pagando as parcelas até o final do consórcio, mas já tá com a moto na garagem. Faz sentido?
CARDS: nenhum
GATE: nenhum

## Turno 7 — pergunta fora do trilho
USUÁRIO: e se eu não tiver entrada? preciso de dinheiro pra dar de lance?
AGENTE: Não precisa não, Mario. Lance é opcional — você pode ser contemplado só no sorteio mensal, sem gastar um centavo a mais. A parcela mensal já te deixa concorrendo normalmente. Agora, se você tiver uma grana guardada e quiser acelerar a contemplação, aí sim vale dar um lance. Aumenta suas chances de ser sorteado antes. Mas não é obrigação nenhuma. Tem reserva pra lance ou prefere ir só no sorteio mesmo?
CARDS: nenhum
GATE: nenhum

## Turno 8
USUÁRIO: não tenho lance guardado não, não quero comprometer além da parcela
AGENTE: Tranquilo, Mario. Sem lance a gente acha opções ótimas pra você — é só questão de esperar o sorteio chegar. Agora me diz uma coisa: você prefere uma parcela menor e espera mais tempo pra ser contemplado, ou quer uma parcela um pouco maior mas com chance de contemplar mais rápido pelo sorteio frequente do grupo?
CARDS: nenhum
GATE: nenhum

## Turno 9
USUÁRIO: prefiro contemplar mais rápido, uma parcela que eu consiga pagar
AGENTE: Perfeito, Mario. Então a gente busca grupos que contemplam bastante por mês — aumenta suas chances de sair no sorteio logo. Quanto você consegue pagar de parcela tranquilamente todo mês pro delivery?
CARDS: nenhum
GATE: nenhum

## Turno 10
USUÁRIO: acho que consigo pagar uns 600 por mês
AGENTE: Anotado, Mario. R$ 600 por mês cabe bem pro seu delivery. Deixa eu trazer as melhores opções nessa faixa — grupos que contemplam bastante todo mês pra você ter chance real de sair logo no sorteio. Achei 4 opções legais pra você, Mario. Olha só: A *Canopus* sai com parcela de R$ 475,93 — bem dentro do seu orçamento. A *Tradição* tem duas: uma com R$ 735,04 que é mais confortável, e outra com R$ 1.239 que fica acima do que você pensou. O Banco do Brasil é mais rápido (15 meses) mas a parcela fica bem alta. Qual delas você quer que eu detalhe pra você ver como funciona direitinho?
CARDS: nenhum
GATE: nenhum

## Turno 11 — pedir simulação oferta já aparecida
USUÁRIO: simula a Canopus pra mim, quanto tempo leva pra contemplar?
AGENTE: Vou apresentar os números pra você ver direitinho:
CARDS: nenhum
GATE: nenhum

## Turno 12
USUÁRIO: ok, tá certo
AGENTE: Acho que me perdi por aqui. Pode mandar de novo, por favor?
CARDS: nenhum
GATE: nenhum

## Turno 13
USUÁRIO: quero ver a simulação da Canopus com 600 de parcela
AGENTE: Beleza, agora vou apresentar os números: Essa é a Canopus, Mario. Parcela de R$ 475,93 por mês, bem dentro do seu orçamento de R$ 600. Sobre contemplação: sem lance, o sorteio mensal é seu caminho — depende da sorte, mas esse grupo contempla bastante gente todo mês. Se você tivesse um lance em caixa, conseguiria acelerar bastante — estima-se chegar em torno de 6 meses, mas sem gastar nada agora, você segue no sorteio normal. Faz sentido pra você?
CARDS: nenhum
GATE: nenhum

## Turno 14
USUÁRIO: faz sim, quero a Canopus
AGENTE: Show, Mario! Só pra confirmar: você quer seguir com a Canopus, sem lance, pagando R$ 475,93 por mês — isso mesmo?
CARDS: nenhum
GATE: nenhum

## Turno 15
USUÁRIO: é isso mesmo, vamos com a Canopus
AGENTE: Perfeito, Mario. Então deixa eu confirmar com você: Mario, as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da administradora ou o valor que você quer olhar de novo que eu detalho certinho pra você. Não tem certo ou errado — depende de você ter pressa ou não. Qual dos dois combina mais com você?
CARDS: decision_prompt, two_paths
GATE: nenhum

## Turno 16
USUÁRIO: vou com a Canopus mesmo, R$ 475,93
AGENTE: Boa, Mario! Pra garantir seu lugar nesse grupo, só preciso de uns dados rápidos pra confirmar sua reserva. Ótimo, Mario! Se precisar de qualquer coisa, continuamos por lá sem problemas. Pra não perder seu atendimento se cair a conexão aqui, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin
GATE: nenhum

## Turno 17
USUÁRIO: sim, é o 5562992496793
AGENTE: Perfeito, Mario! Seu WhatsApp foi anotado. Agora é só você confirmar a oferta que vai aparecer na tela — ela traz exatamente o que a gente acertou: Canopus, R$ 475,93 por mês, 60 meses. Tudo certo aí?
CARDS: nenhum
GATE: nenhum

## Turno 18
USUÁRIO: tudo certo, ótimo
AGENTE: Ótimo, Mario! Sua proposta está sendo processada pela Canopus agora. Você vai receber tudo no WhatsApp — o link pra assinar os documentos e acompanhar cada passo. Qualquer dúvida no caminho, é só chamar que estou por aqui. Bora conquistar essa moto!
CARDS: nenhum
GATE: nenhum

## Fim
Chegou até: proposta processada (Canopus)
Alguma resposta se REPETIU literalmente em turnos diferentes? Não
