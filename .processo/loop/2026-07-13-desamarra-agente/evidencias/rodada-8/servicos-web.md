# servicos — canal web — Bruno
conversationId: 12F98DA3-BB3D-4859-9759-2C4519E1C92C

## Turno 1
USUÁRIO: quero fazer uma reforma, uns 30 mil
AGENTE: [sistema] Te conectando com Camila, especialista em Serviços. Um momento ⏳ Boa, reforma em casa muda tudo! Antes de eu te ajudar a achar a melhor opção, como posso te chamar?
CARDS: —  GATE: name

## Turno 2
USUÁRIO: Bruno
AGENTE: Prazer, Bruno. O que você tem em mente pra realizar?
CARDS: —  GATE: —

## Turno 3
USUÁRIO: vou reformar a cozinha e o banheiro
AGENTE: Legal, cozinha e banheiro — dois ambientes que fazem diferença mesmo. Qual foi o gatilho pra pensar em reforma nesse momento?
CARDS: —  GATE: —

## Turno 4
USUÁRIO: a casa tá velha e precisa de uma renovada
AGENTE: Entendo bem — quando a casa começa a dar sinais de desgaste, é hora de renovar mesmo. Então o objetivo já fica claro: te colocar numa reforma completa, com tranquilidade. E esse valor de 30 mil que você mencionou — é pra cozinha e banheiro juntos, ou tem um orçamento diferente em mente?
CARDS: —  GATE: credit

## Turno 5
USUÁRIO: uns 30 mil pra os dois
AGENTE: Boa, 30 mil então. Pra eu trazer as ofertas reais das administradoras, preciso do seu CPF e do seu celular. Pode ser?
CARDS: —  GATE: identify

## Turno 6
USUÁRIO: [gate identify] CPF: 02874137138, celular: 62992496793, lgpd: true
AGENTE: Encontramos 3 boas opções pra sua faixa. Agora apresento as opções pro você escolher: Escolhe uma pra eu simular os números detalhados pra você. Bora ver qual faz mais sentido?
CARDS: comparison_table  GATE: experience

## Turno 7
USUÁRIO: [gate experience] doubts
AGENTE: Sem problema, vou deixar bem claro! [explicação de consórcio] A diferença pro financiamento é simples: lá você recebe o dinheiro na hora mas paga juros todo mês; aqui você paga menos mas espera ser contemplado. Se tiver alguma dúvida específica sobre como funciona ou sobre as opções que trouxe, é só me chamar! Posso te mostrar a opção que eu recomendo?
CARDS: topic_picker  GATE: —

## Turno 8
USUÁRIO: pode sim, quero ver qual você recomenda
AGENTE: Em quanto tempo você quer realizar isso?
CARDS: —  GATE: —

## Turno 9
USUÁRIO: rápido, umas 2 ou 3 vezes
AGENTE: Entendi — você quer ser contemplado rápido. Isso muda a estratégia: vamos focar em grupos que contemplam bastante gente por mês e considerar o lance pra acelerar. Antes disso, uma pergunta: você tem uma reserva pra dar um lance, ou prefere ficar só na parcela mensal?
CARDS: —  GATE: lance

## Turno 10
USUÁRIO: [gate lance] no
AGENTE: Beleza, foco total na parcela então. [explicação lance embutido] Quer considerar esse tipo de lance nas suas simulações?
CARDS: embedded_bid  GATE: lance-embutido

## Turno 11
USUÁRIO: [gate lance-embutido] yes
AGENTE: Se quiser, temos o nosso simulador pra ver como ficariam as suas parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?
CARDS: —  GATE: simulator-offer

## Turno 12
USUÁRIO: [gate simulator-offer] yes
AGENTE: Olha só — aqui você consegue ver exatamente quando consegue ser contemplado, testando diferentes cenários: Mexe na agulha aí e vê quanto de lance você precisaria pra ser contemplado em 3, 6, 12 meses — ou no prazo que fizer mais sentido pro seu bolso. Ah, e um detalhe importante — esse grupo tem uma procura alta, então quanto antes você se move, melhor a sua posição. Boa! Então deixa eu confirmar com você: esse plano faz sentido pra sua situação?
CARDS: contemplation_dial, decision_prompt  GATE: —

## Turno 13
USUÁRIO: não entendi bem como mexe nessa agulha
AGENTE: Boa pergunta! E simples: Você arrasta a agulha pro mês em que quer ser contemplado — digamos que você quer em 3 meses. Quando você move pra lá, o sistema mostra quanto você precisaria dar de lance (em dinheiro ou usando parte da própria carta) pra conseguir ser contemplado naquele prazo. Quanto mais rápido você quiser ser contemplado, maior o lance necessário — e quanto mais tempo você puder esperar, menor o lance. Testa aí: move a agulha pro mês 3 e vê quanto aparece. Depois tenta o mês 6 ou 12 e compara. Assim você vê qual tempo/lance faz mais sentido pro seu orçamento. Faz sentido agora?
CARDS: —  GATE: —

## Turno 14
USUÁRIO: faz sim! Quero deixar pra 6 meses então
AGENTE: Perfeito! Deixa eu calcular como fica a situação em 6 meses pra você. Então é isso: pra você ser contemplado em 6 meses, você precisaria dar um lance de R$ 16.500,00 no total. Esse lance vem de duas formas: - R$ 9.000,00 de lance embutido — ou seja, você usa parte da própria carta de crédito pra isso - R$ 7.500,00 em dinheiro mesmo, que você precisaria ter guardado O legal é que após ser contemplado, sua parcela cai bastante — de R$ 520,00 pra R$ 270,00 por mês. E o crédito que você recebe pra reforma fica em R$ 21.000,00 (os R$ 9 mil já foram de lance). Tem dinheiro guardado pra dar esse lance, ou prefere ajustar o prazo?
CARDS: —  GATE: —

## Turno 15
USUÁRIO: não tenho dinheiro guardado agora, prefiro deixar pra mais na frente
AGENTE: Faz todo sentido — sem pressa é melhor mesmo. Então a gente trabalha só com a parcela mensal, sem lance por enquanto. Você vai pagar R$ 520,00 por mês e quando tiver uma reserva guardada lá na frente, você aumenta o lance e antecipa a contemplação. Simples assim. Esse plano faz sentido pra sua situação?
CARDS: —  GATE: —

## Turno 16
USUÁRIO: faz sim, quero prosseguir com isso
AGENTE: Ótimo, Bruno! Pra garantir seu lugar nesse grupo, só preciso de uns dados rápidos — e já adianto: você não paga nada agora, é só um pré-cadastro, o pagamento só começa quando chegar o boleto na sua casa. Preenche aí com calma que a gente segue junto até você estar contemplado! Ótimo! Se tiver qualquer problema aqui, continuamos por lá sem interrupção. Só um detalhe — pra garantir que a gente não perde contato e você recebe os boletos e atualizações certinho, me compartilha seu WhatsApp?
CARDS: contract_form, whatsapp_optin  GATE: —

## Turno 17
USUÁRIO: pode usar: 62992496793
AGENTE: Perfeito, anotado! Qualquer dúvida no caminho, é só me chamar que a gente resolve junto. Boa sorte com sua reforma, Bruno!
CARDS: —  GATE: —

## Turno 18
USUÁRIO: obrigado, vou conferir tudo!
AGENTE: De nada! Fico por aqui se precisar de qualquer coisa — quer tirar uma dúvida, quer ajustar algo ou só confirmar o status da sua proposta, é só chamar. Sucesso com a cozinha e o banheiro novos!
CARDS: —  GATE: —

## Fim
Chegou até: pré-cadastro + WhatsApp — FIM DA JORNADA
Apareceu "Acho que me perdi"? não
Apareceu "as opções que já apareceram continuam valendo"? não
Algum card DUPLICADO no mesmo turno? não
Alguma frase IDÊNTICA em turnos diferentes? não
Pediu consentimento ("posso te mostrar a que eu recomendo?") antes dos números? SIM (turno 7: "Posso te mostrar a opção que eu recomendo?")
