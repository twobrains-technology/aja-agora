/**
 * Catálogo de perguntas frequentes, compartilhado entre a home e as landings de
 * vertical (`/autos`, `/imoveis` e `/motos`).
 *
 * Cada página tem o seu conjunto: a home responde no geral, e cada vertical
 * responde o que se pergunta sobre aquele bem — o que a carta compra, quando o
 * bem chega, como fica a alienação. Os conjuntos não se sobrepõem: a mesma
 * dúvida muda de resposta conforme a página ("posso usar FGTS?" tem uma
 * resposta na home e outra, mais específica, em imóvel), então cada texto mora
 * numa entrada só e a página escolhe o conjunto inteiro.
 *
 * Só dado. Nada de JSX, para que arquivos de conteúdo (que não são componentes)
 * possam importar sem arrastar React.
 */

export type KvFaqItem = {
	question: string;
	/** Resumo de uma linha, ao lado da pergunta na barra fechada. */
	summary: string;
	/**
	 * Um parágrafo por item, e não um texto só com quebras: a resposta tem duas
	 * ou três ideias separadas (a regra, depois a ressalva, depois o que fazer),
	 * e emendar tudo num bloco é o que faz FAQ virar parede de texto.
	 */
	answer: readonly string[];
};

/** Home: as dúvidas que aparecem antes de a pessoa escolher o bem. */
export const FAQ_GERAL: readonly KvFaqItem[] = [
	{
		question: "Consórcio é seguro?",
		summary: "Regulamentado por lei e fiscalizado pelo Banco Central.",
		answer: [
			"Sim. O consórcio é regulamentado pela Lei nº 11.795/2008 e fiscalizado pelo Banco Central. Só pode operar quem tem autorização do BC, e a lista de empresas autorizadas é pública — dá pra consultar direto no site do Banco Central.",
			"Além disso, o dinheiro pago pelos participantes pertence ao grupo, com regras claras de gestão definidas em contrato. Antes de entrar, vale sempre conferir se o grupo escolhido está vinculado a uma operação autorizada pelo BC.",
		],
	},
	{
		question: "Quanto tempo demora para ser contemplado?",
		summary: "Depende do sorteio e do lance — mas todo mundo recebe.",
		answer: [
			"Depende de como você é contemplado. Todo mês acontecem assembleias com sorteio, e qualquer participante em dia pode ser sorteado — inclusive logo no início.",
			"Se você não quer depender da sorte, pode ofertar um lance: quem oferece o maior valor antecipa a contemplação. Com uma boa estratégia de lance, dá pra encurtar bastante a espera.",
			"Sem sorteio nem lance vencedor, a contemplação acontece dentro do prazo do grupo. Ou seja: todo participante em dia recebe o crédito até o fim do plano.",
		],
	},
	{
		question: "Posso usar FGTS no consórcio?",
		summary: "Sim, no consórcio de imóvel residencial.",
		answer: [
			"Sim, no consórcio de imóvel residencial. O FGTS pode ser usado para dar lance, amortizar parcelas ou quitar o saldo devedor.",
			"O uso segue as regras do próprio FGTS — como tempo mínimo de trabalho sob o regime e destinação para imóvel residencial urbano. A administradora do grupo orienta o passo a passo junto à Caixa na hora de usar o recurso.",
		],
	},
	{
		question: "Atrasei uma parcela do consórcio. E agora?",
		summary: "Gera multa e juros, mas dá pra regularizar.",
		answer: [
			"O atraso gera multa e juros, conforme previsto no contrato. Enquanto estiver com parcela em aberto, você também deixa de concorrer aos sorteios daquele período.",
			"A boa notícia: dá pra regularizar. Entre em contato com a administradora do grupo o quanto antes para negociar o pagamento e voltar a participar normalmente das assembleias.",
			"Atrasos prolongados podem levar à exclusão do grupo, então quanto mais cedo resolver, melhor.",
		],
	},
	{
		question: "Posso vender minha carta de crédito?",
		summary: "A cota pode ser transferida, com aprovação.",
		answer: [
			"Sim. A cota de consórcio pode ser transferida para outra pessoa, contemplada ou não, mediante aprovação da administradora do grupo.",
			"O novo titular passa por análise e assume os direitos e as obrigações da cota — incluindo as parcelas restantes. A transferência é formalizada em contrato, o que garante segurança para quem vende e para quem compra.",
		],
	},
];

export const FAQ_IMOVEL: readonly KvFaqItem[] = [
	{
		question: "Posso comprar qualquer tipo de imóvel com o consórcio?",
		summary: "Casa, apartamento, terreno, comercial, novo ou usado.",
		answer: [
			"Sim. A carta de crédito serve para casa, apartamento, terreno, imóvel comercial, novo ou usado — e também para construir ou reformar.",
			"A única exigência é que o imóvel esteja regularizado e passe pela avaliação na hora da compra. Isso dá liberdade pra você escolher onde e o que comprar quando for contemplado.",
		],
	},
	{
		question: "Posso usar FGTS no consórcio de imóvel?",
		summary: "Sim — para lance, amortização ou quitação do saldo.",
		answer: [
			"Sim. O FGTS pode ser usado para dar lance, amortizar parcelas ou quitar o saldo devedor, desde que o imóvel seja residencial urbano e você cumpra as regras do fundo.",
			"É uma forma de antecipar a contemplação sem mexer no dinheiro do mês a mês.",
		],
	},
	{
		question: "Posso usar a carta para construir ou quitar um financiamento?",
		summary: "Pode — construção e quitação também valem.",
		answer: [
			"Pode. A carta de crédito do consórcio de imóvel também vale para construção em terreno próprio e para quitar um financiamento imobiliário já existente.",
			"No caso da construção, o crédito é liberado conforme as regras do grupo, com o projeto e a documentação aprovados. Para quitação de financiamento, o valor da carta abate a dívida direto com o banco.",
		],
	},
	{
		question: "Preciso comprovar renda para entrar no consórcio?",
		summary: "Para entrar, não: a análise vem na contemplação.",
		answer: [
			"Para entrar, não. A análise de crédito acontece só na contemplação, quando o grupo vai liberar o valor da carta.",
			"Nesse momento, a administradora avalia sua capacidade de pagar as parcelas restantes e pode pedir garantias. Manter as parcelas em dia ao longo do plano facilita essa etapa.",
		],
	},
	{
		question: "O imóvel fica alienado até o fim do plano?",
		summary: "Fica em garantia, mas você usa normalmente.",
		answer: [
			"Sim. O imóvel comprado fica como garantia do grupo até a quitação das parcelas — o mesmo modelo usado no financiamento.",
			"Você pode morar, alugar ou usar o imóvel normalmente durante esse período. Quando quitar o plano, a alienação é baixada e o imóvel fica 100% livre no seu nome.",
		],
	},
];

export const FAQ_AUTO: readonly KvFaqItem[] = [
	{
		question: "Consórcio serve para carro novo e usado?",
		summary: "Serve para zero ou usado, de qualquer marca e modelo.",
		answer: [
			"Sim. A carta de crédito vale para carro zero ou usado, de qualquer marca e modelo.",
			"Para usados, cada grupo define um limite de idade do veículo no regulamento. Vale conferir essa regra antes de entrar, principalmente se você já tem um modelo em mente.",
		],
	},
	{
		question: "Quando recebo o carro?",
		summary: "Na contemplação — por sorteio mensal ou por lance.",
		answer: [
			"Quando for contemplado — por sorteio, que acontece todo mês nas assembleias, ou por lance, que antecipa a contemplação para quem oferece o maior valor.",
			"Depois da contemplação e da aprovação do crédito, a carta é liberada e você compra o carro à vista, com poder de negociação na loja.",
		],
	},
	{
		question: "Posso escolher um carro mais caro ou mais barato que a carta?",
		summary: "Pode — você completa ou abate a diferença.",
		answer: [
			"Pode. Se o carro custar mais que a carta, você complementa a diferença com recursos próprios. Se custar menos, o valor que sobra pode ser usado para abater parcelas do plano.",
			"Parte do crédito também pode ser usada para despesas de documentação e transferência do veículo, conforme o regulamento do grupo.",
		],
	},
	{
		question: "O carro fica alienado?",
		summary: "Fica em garantia, mas você dirige normalmente.",
		answer: [
			"Sim. O veículo fica alienado à operação até a quitação das parcelas, como garantia do grupo.",
			"Isso não muda o uso no dia a dia: o carro é seu, está no seu nome e você dirige normalmente. Ao quitar o plano, a alienação é baixada no documento.",
		],
	},
	{
		question: "Consigo antecipar a contemplação sem ter dinheiro guardado?",
		summary: "Sim: o lance embutido sai da própria carta.",
		answer: [
			"Sim, com o lance embutido: você usa uma parte do valor da própria carta como lance, dentro do limite definido no regulamento do grupo.",
			"Se o lance vencer, você é contemplado e recebe a carta com o valor do lance descontado. É uma alternativa pra quem quer acelerar sem comprometer a reserva.",
		],
	},
];

export const FAQ_MOTO: readonly KvFaqItem[] = [
	{
		question: "Existe consórcio específico para moto?",
		summary: "Existe, com cartas e parcelas no tamanho desse veículo.",
		answer: [
			"Sim. Existem grupos voltados para motos, com cartas de crédito e parcelas ajustadas ao valor desse tipo de veículo.",
			"A carta vale para moto nova ou usada, de qualquer marca — para usadas, o grupo define um limite de idade no regulamento.",
		],
	},
	{
		question: "Quando recebo a moto?",
		summary: "Na contemplação — por sorteio mensal ou por lance.",
		answer: [
			"Na contemplação, que acontece por sorteio mensal ou por lance. Quem oferece o maior lance antecipa o recebimento.",
			"Com a carta liberada, você compra a moto à vista e ainda pode negociar desconto na loja.",
		],
	},
	{
		question: "As parcelas do consórcio de moto pesam no orçamento?",
		summary: "Sem juros, e a carta menor alivia a parcela.",
		answer: [
			"As parcelas são calculadas sobre o valor da carta, sem juros — o que se paga é a taxa de administração diluída no plano. Por isso, o custo total tende a ser menor que o de um financiamento.",
			"Como as cartas de moto têm valores menores, as parcelas costumam caber em orçamentos mais apertados. O valor exato depende do crédito e do prazo escolhidos.",
		],
	},
	{
		question: "A moto fica alienada?",
		summary: "Fica em garantia, mas o uso é normal.",
		answer: [
			"Sim. A moto fica alienada até a quitação das parcelas, como garantia do grupo — o documento fica no seu nome e o uso é normal.",
			"Quitou o plano, a alienação é baixada e a moto fica totalmente livre.",
		],
	},
	{
		question: "Posso dar lance para receber a moto mais rápido?",
		summary: "Pode — inclusive o lance embutido.",
		answer: [
			"Pode. O lance é a forma de antecipar a contemplação: vence quem oferece o maior valor na assembleia.",
			"Também dá pra usar o lance embutido, que desconta o valor ofertado da própria carta, dentro do limite do regulamento. Assim você acelera o recebimento mesmo sem uma reserva grande.",
		],
	},
];
