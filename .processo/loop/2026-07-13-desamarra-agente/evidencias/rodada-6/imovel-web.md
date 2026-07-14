# imovel — canal web — Fernanda (Apartamento 400 mil)
conversationId: AC231CCC-11CA-48B7-B31D-DC59878D1907

## Turno 1
USUÁRIO: quero comprar um apartamento
AGENTE: [sistema] Te conectando com Helena, especialista em Imóvel. Um momento ⏳. Boa, apartamento novo abre muitas possibilidades! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
GATE: name

## Turno 2
USUÁRIO: Fernanda
AGENTE: Prazer, Fernanda. Qual imóvel você tem em mente?

## Turno 3
USUÁRIO: um apartamento de 400 mil
AGENTE: Boa, 400 mil então. O que te motivou a buscar um apartamento neste momento?

## Turno 4
USUÁRIO: quero sair do aluguel
AGENTE: Entendo bem — sair do aluguel e conquistar o seu próprio espaço muda tudo. Então o objetivo já fica claro: te colocar num apartamento de 400 mil, com tranquilidade e sem juros.

## Turno 5
USUÁRIO: é, exatamente
AGENTE: Perfeito, Fernanda. Para trazer as ofertas reais das administradoras, preciso do seu CPF e celular. Qual é?
GATE: identify

## Turno 6
USUÁRIO: [ação] Identidade enviada (CPF: [CPF de teste], celular: 62992496793, LGPD: sim)
AGENTE: Encontrei várias boas opções na sua faixa! Ótimo, agora você já vê a opção recomendada! Tem outras boas opções na tabela se quiser comparar parcelas ou prazos diferentes, Fernanda. Você já fez consórcio antes?
CARDS: comparison_table
GATE: experience

## Turno 7
USUÁRIO: [ação] Resposta: Já fiz (returning)
AGENTE: Show, vamos direto ao ponto então. Você tem uma reserva pra dar de lance, ou prefere focar numa parcela menor?

## Turno 8
USUÁRIO: [ação] Resposta: Sim, tenho FGTS
AGENTE: Show, com FGTS você consegue antecipar bastante a contemplação. Posso te mostrar a opção que eu recomendo?

## Turno 9
USUÁRIO: sim, claro
AGENTE: Essa é a que eu indicaria pra você — melhor custo-benefício da faixa. Em quanto tempo você quer estar com o seu imóvel?
CARDS: recommendation_card, simulation_result
GATE: timeframe

## Turno 10
USUÁRIO: [ação] Resposta: 10 anos (120 meses)
AGENTE: Tranquilo, 120 meses te deixa com parcela bem confortável e espaço pra um lance forte se quiser antecipar. Boa! E qual valor aproximado você pensa em dar de lance?
GATE: lance-value

## Turno 11
USUÁRIO: [ação] Resposta: R$ 100 mil (lance)
AGENTE: Perfeito, R$ 100 mil de lance te coloca numa posição muito forte pra contemplar rápido. Deixa eu te explicar o lance embutido rapidinho — fica tranquilo, a gente te ajuda. É usar parte da própria carta de crédito como lance — na sua carta de R$ 400.520, por exemplo, você usa uma fatia desse valor pra aumentar suas chances de contemplação, sem precisar ter todo o lance em dinheiro hoje. Quer considerar esse tipo de lance nas suas simulações?
CARDS: embedded_bid
GATE: lance-embutido

## Turno 12
USUÁRIO: [ação] Resposta: Sim (lance embutido)
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
GATE: simulator-offer

## Turno 13
USUÁRIO: [ação] Resposta: Quero ver (simulador)
AGENTE: Dá pra ver bem aqui quando você consegue ser contemplado com esse lance de 100 mil: Ah, e um detalhe importante: esse grupo tem procura alta, então as vagas preenchidas rápido. Mas com seu lance de 100 mil, você fica bem posicionado mesmo assim. Boa, então deixa eu confirmar com você: esse plano faz todo sentido pro seu objetivo.
CARDS: contemplation_dial, scarcity, decision_prompt

## Turno 14
USUÁRIO: desculpa, não entendi o lance embutido direito
AGENTE: Sem problema, Fernanda. O lance embutido é usar uma parte da própria carta de crédito — aqueles 400 mil — como lance pra concorrer à contemplação, sem precisar ter todo o dinheiro do lance guardado agora. Você recebe menos crédito na hora, mas a parcela cai e as chances de ser contemplada aumentam bastante. No seu caso, com 100 mil de lance em dinheiro que você tem no FGTS, a gente ainda pode usar mais 30% da carta (uns 120 mil) como embutido — aí você fica com um lance total bem forte pra antecipar. Faz sentido?

## Turno 15
USUÁRIO: mas de qual administradora é essa?
AGENTE: Essa é a Rodobens — a melhor opção que achei pra você nessa faixa de 400 mil com 120 meses. A parcela fica em R$ 3.332,17 por mês, e com seu lance de 100 mil mais o embutido, você tem chance real de ser contemplada bem antes do final do prazo.

## Turno 16
USUÁRIO: boa, quero seguir então
AGENTE: Boa! Pra confirmar sua reserva na Rodobens, só preciso de uns dados rápidos. Pronto, Fernanda. Você já vê o formulário ali — é só preencher seu CPF, celular e confirmar o aceite LGPD. Sem burocracias, a gente cuida do resto pra você. Qualquer coisa, continuamos por lá sem interrupção. Pra não perder seu atendimento se a gente ficar desconectada, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin

## Turno 17
USUÁRIO: sim, claro
AGENTE: Perfeito, anotado! Agora é com a Rodobens mesmo — você vai receber em breve a proposta com todos os detalhes da sua carta de crédito, prazo e cenário de contemplação. Quando chegar, é só assinar e a gente segue junto até você ser contemplada. Qualquer dúvida no caminho, to por aqui.

## Fim
Chegou até: Encerramento (proposta encaminhada pela Rodobens)
Apareceu "Acho que me perdi"? não
Apareceu "as opções que já apareceram continuam valendo"? não
Pediu consentimento antes de dar os números da recomendada? **SIM** — turno 8 ("Posso te mostrar a opção que eu recomendo?") ← COMPORTAMENTO ESPERADO
Alguma frase IDÊNTICA em turnos diferentes? "Boa! E qual valor aproximado..." (turno 11 também em AUTO); "Sem problema, Fernanda" (turno 14); "Qualquer coisa, continuamos por lá" (template repetido); "a gente cuida do resto" (template repetido)
