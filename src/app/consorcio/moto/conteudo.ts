import { ArrowDown, Percent } from "lucide-react";

import { Motinha } from "@/components/icons/motinha";
import type { BlocoPassosConteudo } from "@/components/vertical/bloco-passos";
import type { FaixaNumerosConteudo } from "@/components/vertical/faixa-numeros";
import type { GuiaArtigosConteudo } from "@/components/vertical/guia-artigos";
import type { HeroVerticalConteudo } from "@/components/vertical/hero-vertical";

// Texto da landing de consórcio de moto (Figma 'Consórcios - moto' 625:3679).
// Terceira vertical; as seções são as mesmas das outras duas, menos a terceira,
// que aqui é a jornada em três passos e não existe nem em imóvel nem em auto.
//
// Divergências do comp, todas deliberadas:
// - "QUAL A SUA PROPÓSITO" e "consorcio" sem acento → corrigidos (CLAUDE.md).
// - O CTA do hero vem "Compare agora a sua moto ideal?" com interrogação; um
//   botão não faz pergunta, então o ponto sai.
// - O card de contemplações diz "de imóveis" numa página de moto: o rótulo veio
//   colado do comp de imóvel. Ver o comentário na própria chave.

const KV = "/kv";

export const HERO_MOTO: HeroVerticalConteudo = {
	badge: "o jeito independente de escolher consórcio",
	titulo: [
		{ texto: "O consórcio" },
		{ texto: "lidera", enfase: true },
		{ texto: "a compra de motos novas no Brasil" },
	],
	// Aqui o negrito ABRE a frase — foi este comp que fez o `subtitulo` deixar de
	// ser `{ inicio, destaque, fim }` e virar lista de segmentos.
	subtitulo: [
		{ texto: "Sem juros, com parcela previsível", forte: true },
		{
			texto:
				"e sem entrada obrigatória. A AJA compara as opções das administradoras e mostra o que faz sentido para o seu momento.",
		},
	],
	// 610px como em auto: a manchete do comp quebra em três linhas, e a segunda
	// ("a compra de motos") mede 559px — não cabe nos 535 do default.
	larguraTexto: 610,
	atalhos: {
		eyebrow: "ENCONTRE A PARCELA IDEAL PARA VOCÊ",
		itens: [
			{ icone: ArrowDown, label: "Modelos com parcela mínima" },
			{ icone: Percent, label: "Modelos com parcela reduzida" },
		],
	},
	card: {
		titulo: "Quanto você precisa para a sua moto?",
		parcelaRotulo: "Parcelas:",
		// A primeira é a que o comp mostra; as demais escalonam até o topo da faixa.
		parcelas: ["R$ 320/mês", "R$ 450/mês", "R$ 600/mês", "R$ 850/mês", "R$ 1.100/mês"],
		cta: "Compare agora a sua moto ideal",
	},
	ilustracao: {
		src: `${KV}/moto-hero-colagem.png`,
		alt: "Motociclista de capacete ao lado da moto esportiva e da conversa com a Aja",
		proporcao: "1320/1004",
		largura: 660,
	},
	// `selo` de propósito ausente: o "Sem custo extra" já vem achatado dentro da
	// colagem. Declarar aqui desenharia a pill uma segunda vez por cima.
	sementeVazia: "Quero comprar uma moto.",
	semente: (parcela) => `Quero uma moto. Consigo pagar ${parcela}.`,
};

export const NUMEROS_MOTO: FaixaNumerosConteudo = {
	eyebrow: "QUAL O SEU PROPÓSITO",
	titulo: { inicio: "Informação para decidir com mais", enfase: "segurança" },
	cobertura: {
		titulo: "Quais motos?",
		itens: [
			"Motos novas, de qualquer cilindrada.",
			"Motos usadas.",
			"Concessionária ou particular.",
			"Quitação de financiamento.",
			"Documentação e emplacamento.",
		],
		arte: {
			src: `${KV}/moto-capacete.png`,
			alt: "",
			proporcao: "336/352",
			largura: 168,
			sangria: 60,
		},
	},
	destaque: {
		numero: { inteiro: "3", decimal: "22" },
		unidade: "milhões",
		descricao: "de brasileiros participam de consórcios de motocicletas.",
		selo: { src: `${KV}/bandeira-brasil.png`, alt: "" },
	},
	contemplacoes: {
		numero: "675",
		unidade: "mil",
		// O comp escreve "contemplações DE IMÓVEIS" aqui — o card inteiro veio
		// colado da vertical de imóvel. O rótulo vai corrigido; o NÚMERO, porém,
		// provavelmente veio junto no mesmo copy-paste.
		// TODO: confirmar 675 mil na ABAC 2025 para motocicletas antes de publicar.
		descricao: [{ texto: "contemplações", forte: true }, { texto: "de motos" }],
		pictograma: Motinha,
		total: 15,
		// Posições em coral lidas do comp por varredura: 4 de 15.
		destacados: [3, 6, 12, 14],
	},
	carta: {
		icone: { src: `${KV}/cedula-dinheiro.svg`, alt: "" },
		titulo: { inicio: "Como funciona a carta de", enfase: "crédito", fim: "para motos?" },
		texto: {
			// O comp encadeia "e paga o vendedor direto você compra como quem paga à
			// vista", sem a pausa que a frase pede. Aqui entra o dois-pontos.
			inicio:
				"Quando você é contemplado, por sorteio ou lance, o crédito fica disponível em até três dias úteis. A administradora analisa sua capacidade de pagamento e a moto escolhida, e paga o vendedor direto:",
			forte: "você compra como quem paga à vista.",
			fim: "A moto fica com gravame no Detran até o fim do plano, e é isso que dispensa cartório e faz o processo levar dias, não semanas.",
		},
		foto: {
			src: `${KV}/moto-carta-credito.jpg`,
			alt: "Motociclista conferindo o celular ao lado da moto",
		},
	},
	fonte: "Fonte: ABAC – Associação Brasileira de Administradoras de Consórcios. Dados de 2025.",
};

export const PASSOS_MOTO: BlocoPassosConteudo = {
	eyebrow: "MOTO COMO FERRAMENTA DE TRABALHO",
	titulo: { inicio: "Para quem a moto é", enfase: "renda", fim: ", não só transporte" },
	texto: {
		inicio: "Você começa pagando menos enquanto se organiza.",
		forte: "A parcela reduzida",
		fim: "ajuda a manter o fluxo do seu trabalho até a contemplação da moto.",
	},
	passos: [
		{
			rotulo: "Passo 01",
			titulo: "Enquanto a moto\né alugada",
			ilustracao: {
				src: `${KV}/moto-passo-bolsa.png`,
				alt: "Bolsa térmica de entrega",
			},
			tom: "creme",
			descricao:
				"A diária sai do que você fez no dia. No fim do mês, o dinheiro foi embora e a moto continua sendo da locadora.",
		},
		{
			rotulo: "Passo 02",
			titulo: "O grupo se movimenta\nenquanto você anda",
			ilustracao: {
				src: `${KV}/moto-passo-cedulas.png`,
				alt: "Cédulas de cem reais",
			},
			tom: "navy",
			descricao:
				"Você entra, paga a parcela e segue rodando. A contemplação pode vir por sorteio em qualquer assembleia, e dá para antecipar com lance.",
		},
		{
			rotulo: "Passo 03",
			titulo: "A moto no seu\nnome",
			ilustracao: {
				src: `${KV}/moto-passo-veiculo.png`,
				alt: "Moto esportiva azul",
			},
			tom: "coral",
			descricao:
				"A administradora paga ao vendedor à vista e a moto sai no seu nome. O que saía de diária de aluguel passa a ser lucro que fica inteiramente com você.",
		},
	],
	cta: "Quero comparar as melhores alternativas",
	semente: "Quero usar consórcio para ter minha moto de trabalho.",
};

// O conjunto de moto mora no catálogo, junto com os das outras páginas: são as
// mesmas cinco dúvidas em versões diferentes por bem, e mantê-las lado a lado é
// o que deixa a divergência visível.
export { FAQ_MOTO } from "@/components/kv/faq-catalogo";

export const GUIA_MOTO: GuiaArtigosConteudo = {
	eyebrow: "GUIA PARA CONSÓRCIO DE MOTOS",
	// Com `enfase`, ao contrário de auto: aqui o comp põe "planejar melhor." em
	// Merriweather itálico, como em imóvel.
	titulo: { inicio: "Conhecimento para quem quer", enfase: "planejar melhor." },
	texto:
		"Explore nossos artigos sobre consórcio de motocicletas, manutenção, modelos e tudo o que pode ajudar na conquista da sua liberdade sobre duas rodas.",
	chamadaArtigo: "Ler artigo completo",
	// TODO: URLs reais quando o blog existir — o comp não define destino.
	artigos: [
		{
			href: "#",
			capa: {
				src: `${KV}/moto-artigo-eletrica.jpg`,
				alt: "Moto elétrica parada em rua arborizada",
			},
			tags: ["Elétricas", "Economia", "Tendências"],
			titulo: "Vale a pena comprar uma moto elétrica?",
			resumo:
				"Analisamos a economia de combustível, a autonomia das baterias e o custo-benefício de rodar de forma elétrica em 2026.",
		},
		{
			href: "#",
			capa: {
				src: `${KV}/moto-artigo-valorizacao.jpg`,
				alt: "Moto custom clássica em estúdio",
			},
			tags: ["Valorização", "Custom", "Investimento"],
			titulo: "As motos que mais valorizaram este ano",
			resumo:
				"Descubra quais modelos clássicos e modernos ganharam destaque e se tornaram verdadeiros investimentos sobre duas rodas.",
		},
		{
			href: "#",
			capa: {
				src: `${KV}/moto-artigo-precos.jpg`,
				alt: "Motociclista em estrada de montanha ao pôr do sol",
			},
			tags: ["Trail", "Cilindrada", "Segurança"],
			titulo: "O preço das motos vai subir ou cair?",
			resumo:
				"Entenda os fatores econômicos, a taxa de importação de peças e as projeções para o mercado de motocicletas no Brasil.",
		},
	],
};
