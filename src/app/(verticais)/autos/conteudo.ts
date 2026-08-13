import { ArrowDown, Percent } from "lucide-react";

import { Carrinho } from "@/components/icons/carrinho";
import { FONTE_ABAC } from "@/components/kv/fonte-abac";
import type { BlocoUpgradeConteudo } from "@/components/vertical/bloco-upgrade";
import type { FaixaNumerosConteudo } from "@/components/vertical/faixa-numeros";
import type { GuiaArtigosConteudo } from "@/components/vertical/guia-artigos";
import type { HeroVerticalConteudo } from "@/components/vertical/hero-vertical";

// Texto da landing de consórcio de carro (Figma 'Consórcios - auto' 625:3331).
// Segunda vertical da família; as seções são as mesmas de imóvel, menos a terceira,
// que aqui é o diagrama de upgrade e não existe lá.
//
// Ortografia: o comp escreve "QUAL A SUA PROPÓSITO" e "consorcio" sem acento;
// aqui vai corrigido, como manda o CLAUDE.md.

const KV = "/kv";

export const HERO_AUTO: HeroVerticalConteudo = {
	badge: "o jeito independente de escolher consórcio",
	titulo: [
		{ texto: "Quase" },
		{ texto: "1 em cada 3", enfase: true },
		{ texto: "carros novos no Brasil passou por" },
		{ texto: "consórcio", enfase: true },
	],
	subtitulo: [
		{
			texto:
				"Compare alternativas de consórcio, encontre a opção ideal para o seu orçamento. Em 2025, o consórcio movimentou mais de",
		},
		{ texto: "R$ 132 bilhões", forte: true },
		{ texto: "em negócios no segmento de veículos leves." },
	],
	// 610px: no comp de auto a manchete é mais larga que a de imóvel, e é isso que
	// a faz quebrar em três linhas em vez de quatro.
	larguraTexto: 610,
	atalhos: {
		eyebrow: "ENCONTRE A PARCELA IDEAL PARA VOCÊ",
		itens: [
			{ icone: ArrowDown, label: "Modelos com parcela mínima" },
			{ icone: Percent, label: "Modelos com parcela reduzida" },
		],
	},
	card: {
		titulo: "Quanto você precisa para o seu carro?",
		parcelaRotulo: "Parcelas:",
		// A primeira é a que o comp mostra; as demais escalonam até o topo da faixa
		// de crédito de auto (20 mil a 500 mil no mesmo arquivo).
		parcelas: ["R$ 680/mês", "R$ 900/mês", "R$ 1.200/mês", "R$ 1.800/mês", "R$ 2.500/mês"],
		cta: "Compare agora o carro ideal",
	},
	ilustracao: {
		src: `${KV}/auto-hero-colagem.png`,
		alt: "Motorista sorrindo ao volante, ao lado do SUV e da conversa com a Aja",
		proporcao: "2579/2047",
		largura: 684,
	},
	// `selo` de propósito ausente: o "💸 Sem custo extra" já vem achatado dentro
	// da colagem. Declarar aqui desenharia a pill uma segunda vez por cima.
	sementeVazia: "Quero comprar um carro.",
	semente: (parcela) => `Quero um carro. Consigo pagar ${parcela}.`,
};

export const NUMEROS_AUTO: FaixaNumerosConteudo = {
	eyebrow: "QUAL O SEU PROPÓSITO",
	titulo: { inicio: "Informação para decidir com mais", enfase: "segurança" },
	cobertura: {
		titulo: "Quais veículos?",
		itens: [
			"Carros leves novos.",
			"Carros leves usados.",
			"Compra em concessionárias ou com particulares.",
			"Documentação e despesas relacionadas à aquisição.",
		],
		arte: {
			src: `${KV}/auto-chave.png`,
			alt: "",
			proporcao: "560/1044",
			largura: 190,
			sangria: 63,
		},
	},
	destaque: {
		numero: { inteiro: "5", decimal: "38" },
		unidade: "milhões",
		descricao: "de brasileiros participam de consórcios de veículos leves.",
		selo: { src: `${KV}/bandeira-brasil.png`, alt: "" },
	},
	contemplacoes: {
		numero: "764",
		unidade: "mil",
		// Aqui o negrito cai em "contemplações"; em imóvel cai no complemento.
		descricao: [{ texto: "contemplações", forte: true }, { texto: "de veículos leves" }],
		pictograma: Carrinho,
		total: 15,
		// Posições em coral copiadas do comp — 4 de 15, espalhadas.
		destacados: [0, 3, 7, 14],
	},
	carta: {
		icone: { src: `${KV}/cedula-dinheiro.svg`, alt: "" },
		titulo: { inicio: "Como funciona a carta de", enfase: "crédito", fim: "para veículos?" },
		texto: {
			inicio:
				"Quando você é contemplado, por sorteio ou lance, recebe a carta de crédito no valor contratado para comprar o seu veículo. Ela funciona como um",
			forte: "pagamento à vista, permitindo negociar melhores condições",
			fim: "e escolher o carro que faz sentido para o seu momento, seja ele novo ou seminovo.",
		},
		foto: {
			src: `${KV}/auto-carta-credito.jpg`,
			alt: "Mulher ao volante do carro recém-conquistado",
		},
	},
	fonte: FONTE_ABAC,
};

export const UPGRADE_AUTO: BlocoUpgradeConteudo = {
	// O comp repete aqui o eyebrow da vertical de imóvel — "PARA QUEM DECIDE USAR
	// O FGTS NA JORNADA" — numa seção que fala de trocar de carro. FGTS não pode
	// ser usado em consórcio de veículo, então o rótulo do comp não entra.
	eyebrow: "PARA QUEM ESTÁ PRONTO PARA TROCAR DE CARRO",
	titulo: { inicio: "A hora de dar um", enfase: "upgrade" },
	texto: {
		inicio: "Saia do carro alugado que pesa no bolso.",
		forte: "Com parcela mínima,",
		fim: "dê o primeiro passo para um elétrico que economiza no dia a dia e abre portas para corridas mais rentáveis.",
	},
	fita: { src: `${KV}/auto-fita-upgrade.svg`, alt: "" },
	veiculo: { src: `${KV}/auto-upgrade-veiculo.png`, alt: "SUV elétrico visto de frente" },
	grupos: [
		{
			rotulo: "Hoje",
			icone: { src: `${KV}/auto-upgrade-hoje.png`, alt: "" },
			itens: [
				"Diária de aluguel todo dia",
				"Tanque cheio toda semana",
				"Categoria básica no aplicativo",
				"No fim do mês, o carro não é seu",
			],
		},
		{
			rotulo: "A troca",
			icone: { src: `${KV}/auto-upgrade-troca.png`, alt: "" },
			itens: [
				"Consórcio sem juros e sem entrada",
				"Você escolhe o valor do crédito",
				"Sorteio ou lance para antecipar",
				"O carro sai no seu nome",
			],
		},
		{
			rotulo: "Depois",
			icone: { src: `${KV}/auto-upgrade-depois.png`, alt: "" },
			itens: [
				"Combustível cai para menos de um quarto",
				"Revisão a cada 20 mil km, não 10 mil",
				"Elétrico entra na categoria premium do app",
				"No fim de semana, o carro é da família",
			],
		},
	],
	cta: "Quero comparar as melhores alternativas",
	semente: "Quero trocar de carro usando consórcio.",
};

// O conjunto de carro mora no catálogo, junto com os das outras páginas: são as
// mesmas cinco dúvidas em versões diferentes por bem, e mantê-las lado a lado é
// o que deixa a divergência visível.
export { FAQ_AUTO } from "@/components/kv/faq-catalogo";

export const GUIA_AUTO: GuiaArtigosConteudo = {
	eyebrow: "GUIA PARA CONSÓRCIO",
	// Sem `enfase`: no comp de auto o título é todo Poppins, ao contrário do de
	// imóvel, que põe "planejar melhor." em serifa itálica.
	titulo: { inicio: "Conhecimento para quem quer planejar melhor." },
	texto:
		"Explore nossos artigos sobre consórcio, planejamento financeiro e tudo o que pode ajudar na sua decisão.",
	chamadaArtigo: "Ler artigo completo",
	// TODO: URLs reais quando o blog existir — o comp não define destino.
	artigos: [
		{
			href: "#",
			capa: {
				src: `${KV}/auto-artigo-eletrico.jpg`,
				alt: "Carro elétrico azul conectado ao carregador",
			},
			tags: ["Carro Elétrico", "Mercado", "Mobilidade"],
			titulo: "Vale a pena comprar um carro elétrico?",
			resumo: "Entenda os custos, vantagens e os principais pontos antes de tomar sua decisão.",
		},
		{
			href: "#",
			capa: {
				src: `${KV}/auto-artigo-valorizacao.jpg`,
				alt: "Fileira de carros no salão de uma concessionária",
			},
			tags: ["Mercado", "Valorização", "Seminovos"],
			titulo: "Os carros que mais valorizaram este ano",
			resumo: "Veja quais modelos ganharam valor no mercado e o que explica esse movimento.",
		},
		{
			href: "#",
			capa: {
				src: `${KV}/auto-artigo-precos.jpg`,
				alt: "Chave de carro sobre notas de cem reais",
			},
			tags: ["Preços", "Economia", "Análise"],
			titulo: "O preço dos carros vai subir ou cair?",
			resumo: "Entenda os fatores que estão movimentando os valores dos veículos no Brasil.",
		},
	],
};
