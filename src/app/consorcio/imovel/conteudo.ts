import { Casinha } from "@/components/icons/casinha";
import type { BlocoFormasConteudo } from "@/components/vertical/bloco-formas";
import type { FaixaNumerosConteudo } from "@/components/vertical/faixa-numeros";
import type { GuiaArtigosConteudo } from "@/components/vertical/guia-artigos";
import type { HeroVerticalConteudo } from "@/components/vertical/hero-vertical";

// Texto da landing de consórcio de imóvel (Figma 'Consórcios - imóvel' 625:4133).
// É este arquivo que muda quando a próxima vertical (auto, moto, serviços) chegar
// — os componentes de `src/components/vertical/` são os mesmos.
//
// Ortografia: o comp traz "imovél", "do seus sonhos" e "QUAL A SUA PROPÓSITO";
// aqui vai corrigido, como manda o CLAUDE.md.

const KV = "/kv";

export const HERO_IMOVEL: HeroVerticalConteudo = {
	// Assinatura da marca, como no comp — vem logo após o símbolo da AJA, por isso
	// começa em minúscula ("AJA, o jeito independente…"). O comp escreve
	// "consorcio" sem acento.
	badge: "o jeito independente de escolher consórcio",
	titulo: [
		{ texto: "Cada parcela vira" },
		{ texto: "patrimônio", enfase: true },
		{ texto: "dos seus sonhos" },
	],
	subtitulo: [
		{ texto: "Em 2025, mais de 1,3 milhão de brasileiros entraram em um consórcio de imóvel." },
		{ texto: "Sem juros de financiamento, com parcela previsível", forte: true },
		{ texto: "e tempo para se organizar até a chave na mão." },
	],
	card: {
		titulo: "Quanto você precisa para o seu imóvel?",
		parcelaRotulo: "Parcelas:",
		parcelas: ["R$ 800/mês", "R$ 1.200/mês", "R$ 1.800/mês", "R$ 2.500/mês", "R$ 3.500/mês"],
		cta: "Compare agora o seu imóvel ideal",
	},
	ilustracao: {
		src: `${KV}/imovel-hero-colagem.png`,
		alt: "Mulher sorrindo com a chave do imóvel na mão, ao lado da fachada da casa e da conversa com a Aja",
		proporcao: "2678/2043",
		largura: 656,
	},
	// `selo` de propósito ausente: o "💸 Sem custo extra" já está achatado dentro
	// da colagem. Declarar aqui desenharia a pill uma segunda vez por cima.
	sementeVazia: "Quero comprar um imóvel.",
	semente: (parcela) => `Quero um imóvel. Consigo pagar ${parcela}.`,
};

export const NUMEROS_IMOVEL: FaixaNumerosConteudo = {
	eyebrow: "QUAL O SEU PROPÓSITO",
	titulo: { inicio: "Informação para decidir com mais", enfase: "segurança" },
	cobertura: {
		titulo: "Quais imóveis?",
		itens: [
			"Imóvel residencial, usado ou na planta",
			"Comercial e terreno urbano",
			"Construção e reforma",
			"Quitação de financiamento",
			"Despesas da aquisição",
		],
		arte: {
			src: `${KV}/imovel-chaveiro.png`,
			alt: "",
			proporcao: "560/513",
			largura: 220,
			sangria: 120,
		},
	},
	destaque: {
		numero: { inteiro: "2", decimal: "83" },
		unidade: "milhões",
		descricao: "de brasileiros participam de consórcios de imóveis.",
		selo: { src: `${KV}/bandeira-brasil.png`, alt: "" },
	},
	contemplacoes: {
		numero: "145",
		unidade: "mil",
		descricao: [
			{ texto: "contemplações", quebra: true },
			{ texto: "de imóveis", forte: true },
		],
		pictograma: Casinha,
		total: 15,
		// Posições em coral copiadas do comp — 5 de 15, espalhadas, não as 5 primeiras.
		destacados: [0, 6, 8, 9, 11],
	},
	carta: {
		icone: { src: `${KV}/cedula-dinheiro.svg`, alt: "" },
		titulo: { inicio: "Como funciona a carta de", enfase: "crédito", fim: "para imóveis?" },
		texto: {
			inicio:
				"Quando contemplado por sorteio ou lance, o crédito fica disponível em até 3 dias úteis. Após análise de pagamento, documentos e vistoria do imóvel, o valor é pago direto ao vendedor,",
			forte: "permitindo negociar como uma compra à vista.",
			fim: "O imóvel segue em alienação fiduciária até o fim do plano.",
		},
		foto: {
			src: `${KV}/imovel-carta-credito.jpg`,
			alt: "Casal abrindo caixas de mudança no imóvel recém-conquistado",
		},
	},
	fonte: "Fonte: ABAC – Associação Brasileira de Administradoras de Consórcios. Dados de 2025.",
};

export const FGTS_IMOVEL: BlocoFormasConteudo = {
	eyebrow: "PARA QUEM DECIDE USAR O FGTS NA JORNADA",
	titulo: { inicio: "Use seu", enfase: "FGTS", fim: "no consórcio" },
	texto:
		"Sabia que você pode usar o saldo do FGTS para dar lance, complementar parcelas ou quitar o consórcio de imóvel? Planeje seu futuro patrimônio com ainda mais velocidade.",
	formasEyebrow: "PRINCIPAIS FORMAS DE USAR SEU SALDO",
	// `alt` vazio de propósito nas quatro: a ilustração repete o que o título já
	// diz, então anunciá-la em leitor de tela seria ruído.
	formas: [
		{
			numero: "01",
			titulo: "Lance com FGTS",
			descricao:
				"Use o saldo do seu FGTS para ofertar lances e antecipar sua contemplação no consórcio de forma estratégica.",
			ilustracao: { src: `${KV}/fgts-martelo.png`, alt: "" },
		},
		{
			numero: "02",
			titulo: "Amortização de parcelas",
			descricao:
				"Reduza o valor das suas parcelas mensais usando o saldo acumulado do FGTS periodicamente.",
			ilustracao: { src: `${KV}/fgts-calculadora.png`, alt: "", ajuste: { y: 37 } },
		},
		{
			numero: "03",
			titulo: "Quitação do saldo devedor",
			descricao:
				"Quite total ou parcialmente o saldo devedor restante do seu consórcio imobiliário garantindo tranquilidade.",
			ilustracao: { src: `${KV}/fgts-balanca.png`, alt: "", ajuste: { y: 29 } },
		},
		{
			numero: "04",
			titulo: "Complemento da carta",
			descricao:
				"Use seu saldo do FGTS para complementar o valor total da carta de crédito na hora da compra do imóvel dos seus sonhos.",
			// No comp o leque de cédulas fica encaixado no canto: passa 33px da borda
			// direita do card e afunda mais que as outras três.
			ilustracao: { src: `${KV}/fgts-cedulas.png`, alt: "", ajuste: { x: 33, y: 53 } },
		},
	],
	cta: "Quero comparar as melhores alternativas",
	semente: "Quero usar meu FGTS no consórcio de imóvel.",
};

// O comp repete "Autorizada pelo Banco Central…" no resumo da segunda pergunta,
// que fala de prazo de contemplação — resumo trocado no comp. Aqui vale o texto
// que já responde a pergunta certa, o mesmo que a home usa.
// O conjunto de imóvel mora no catálogo, junto com os das outras páginas: são
// as mesmas cinco dúvidas em versões diferentes por bem, e mantê-las lado a
// lado é o que deixa a divergência visível.
export { FAQ_IMOVEL } from "@/components/kv/faq-catalogo";

export const GUIA_IMOVEL: GuiaArtigosConteudo = {
	eyebrow: "GUIA PARA CONSÓRCIO",
	titulo: { inicio: "Conhecimento para quem quer", enfase: "planejar melhor." },
	texto:
		"Explore nossos artigos sobre consórcio imobiliário, planejamento financeiro e tudo o que pode ajudar na conquista da sua chave na mão.",
	chamadaArtigo: "Ler artigo completo",
	// TODO: URLs reais quando o blog existir — o comp não define destino.
	artigos: [
		{
			href: "#",
			capa: {
				src: `${KV}/imovel-artigo-planta.jpg`,
				alt: "Fachada de um edifício residencial moderno",
			},
			tags: ["Na Planta", "Investimento", "Planejamento"],
			titulo: "Vale a pena comprar um imóvel na planta?",
			resumo:
				"Entenda os custos, as vantagens e os principais cuidados com a documentação antes de fechar o contrato.",
		},
		{
			href: "#",
			capa: {
				src: `${KV}/imovel-artigo-bairros.jpg`,
				alt: "Vista aérea de um bairro residencial arborizado",
			},
			tags: ["Valorização", "Mercado", "Localização"],
			titulo: "Os bairros que mais valorizaram este ano",
			resumo:
				"Descubra as regiões que ganharam destaque no mercado imobiliário e o que explica esse movimento histórico.",
		},
		{
			href: "#",
			capa: {
				src: `${KV}/imovel-artigo-precos.jpg`,
				alt: "Sala de jantar iluminada pelo sol da tarde",
			},
			tags: ["Análise", "Economia", "Tendências"],
			titulo: "O preço dos imóveis vai subir ou cair?",
			resumo:
				"Entenda as tendências e os fatores macroeconômicos que estão movimentando os valores no Brasil.",
		},
	],
};
