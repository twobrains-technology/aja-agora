"use client";

import Image from "next/image";
import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { CARD_SHADOW, KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

const KV = "/kv";

type TipoCard = {
	id: string;
	title: string;
	descriptionLead: string;
	/** Linhas do restante da descrição — a 1ª cola na mesma linha do lead (com espaço),
	 *  as seguintes forçam quebra (blueprint traz quebras deliberadas por card). */
	descriptionRestLines: string[];
	/** Quando o lead ocupa a 1ª linha inteira e o restante começa na linha de baixo
	 *  (card Moto no Figma: "Saia da moto alugada," quebra antes de "escape do trânsito"). */
	descriptionBreakAfterLead?: boolean;
	button: string;
	/** Seed enviado ao abrir o chat (onOpenChat) — categoria já expressa como frase. */
	seed: string;
	tags: string[];
	image: {
		src: string;
		alt: string;
		/** Zoom manual do cutout dentro da caixa — classes Tailwind de `scale-*`
		 *  literais (ex: "scale-110", ou responsivo "scale-125 md:scale-100").
		 *  Precisa ser Tailwind válido pra classe ser gerada (nada de string
		 *  interpolada/arbitrária calculada em runtime). Ajusta aqui pra afinar o
		 *  "peso visual" entre os cards sem precisar reabrir o PNG num editor. */
		scaleClassName?: string;
	} | null;
	/** Decoração coral atrás do cutout — SVG dedicado ao tipo (Imóvel: fita
	 *  diagonal; Moto: anel), como em Home.png. Sem `decoration` (Carro, ainda
	 *  sem forma própria no Figma) → nenhuma decoração, só o fundo do card. */
	decoration?: {
		src: string;
		className: string;
		/** Alinhamento do wrapper que centraliza a decoração (Figma: Imóvel cola
		 *  à esquerda, Moto cola no topo do card) — default é centro nos 2 eixos. */
		align?: string;
	};
};

// Área da imagem: altura fixa nos 3 cards pra título/botão/chips caírem na mesma
// régua entre eles. overflow-hidden clipa só o SunBurst decorativo (raios não
// invadem o texto abaixo) — o cutout NUNCA é cortado (object-contain o mantém inteiro).
const IMAGE_AREA_CLASS = "relative h-[220px] overflow-hidden md:h-[248px]";

const CARDS: TipoCard[] = [
	{
		id: "carro",
		title: "Carro",
		descriptionLead: "Para gerar renda",
		descriptionRestLines: [", ganhar mobilidade ou conquistar o carro que faz sentido para você."],
		button: "Compara opções",
		seed: "Quero comprar um carro.",
		tags: ["Viagens", "Primeiro carro", "Autonomia"],
		image: {
			src: "image-3.png",
			alt: "Carro em estrada ao entardecer",
			// Carro é limitado pela LARGURA da caixa (sua foto é bem mais larga que
			// alta); no mobile a caixa tem altura fixa mas largura variável (coluna
			// única), então o carro encolhe (largura E altura) em telas estreitas
			// enquanto casa/moto (limitados pela altura) não mudam — ficava baixo
			// demais perto dos outros dois. scale-110 só no mobile compensa; md
			// volta pro ajuste normal de desktop.
			scaleClassName: "scale-110 md:scale-90",
		},
		decoration: {
			src: "tipo-carro.svg",
			className: "h-[100%] w-auto shrink-0",
			align: "items-center justify-start",
		},
	},
	{
		id: "imovel",
		title: "Imóvel",
		descriptionLead: "Conquiste o imóvel",
		descriptionRestLines: [
			" que é seu",
			"e transforme cada parcela em",
			"patrimônio e saia do Aluguel.",
		],
		button: "Buscar alternativas",
		seed: "Quero comprar um imóvel.",
		tags: ["Sair do aluguel", "Casa própria", "Patrimônio"],
		image: {
			src: "image-1.png",
			alt: "Casa própria conquistada",
			// Limitado pela ALTURA (mesma nos dois breakpoints) — sem o problema
			// de encolher no mobile que o carro tinha, não precisa de responsivo.
			scaleClassName: "scale-110",
		},
		decoration: {
			src: "tipo-imovel.svg",
			className: "h-[100%] w-auto shrink-0",
			align: "items-center justify-end",
		},
	},
	{
		id: "moto",
		title: "Moto",
		descriptionLead: "Saia da moto alugada,",
		descriptionBreakAfterLead: true,
		descriptionRestLines: ["escape do trânsito ou realize", "o sonho da moto própria."],
		button: "Simular ofertas",
		seed: "Quero comprar uma moto.",
		tags: ["Trânsito", "Economia", "Mobilidade"],
		image: {
			src: "image-2.png",
			alt: "Motocicleta em destaque",
			scaleClassName: "scale-110",
		},
		decoration: {
			src: "tipo-moto.svg",
			className: "w-[70%] h-auto shrink-0",
			align: "items-start justify-center",
		},
	},
];

interface KvTiposProps {
	onOpenChat: TheaterOpener;
}

export function KvTipos({ onOpenChat }: KvTiposProps) {
	return (
		// Painel navy FULL-BLEED: largura total da tela, cantos retos, sem margem cream
		// em volta (Figma: Rectangle 85 1442x963, x≈0). Só o CONTEÚDO fica no container
		// max-w centralizado. overflow-hidden clipa os ornamentos navy-claro do fundo.
		<section
			aria-labelledby="tipos-consorcio-heading"
			className="relative w-full overflow-hidden bg-[#021628]"
		>
			{/* Ornamento navy tone-on-tone do painel — sutil, atrás de todo o conteúdo.
			    Mesmo vetor nos dois cantos: canto superior esquerdo normal, canto
			    inferior direito espelhado (rotate-180 = mirror nos dois eixos). */}
			{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
			<img
				aria-hidden="true"
				src={`${KV}/tipos-vetor.svg`}
				alt=""
				className="pointer-events-none absolute -left-10 -top-10 z-0 h-auto w-[380px] md:w-[560px]"
			/>
			{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
			<img
				aria-hidden="true"
				src={`${KV}/tipos-vetor.svg`}
				alt=""
				className="pointer-events-none absolute -bottom-10 -right-10 z-0 h-auto w-[380px] rotate-180 md:w-[560px]"
			/>

			<KvContainer className="z-10 max-w-[1320px] py-6 md:py-8">
				<div className="mx-auto max-w-[820px] text-center">
					<KvEyebrow>QUAL É O SEU OBJETIVO</KvEyebrow>
					<h2
						id="tipos-consorcio-heading"
						className="mt-3 text-[32px] font-normal leading-[1.15] text-white md:text-[44px] md:leading-[62px]"
					>
						Escolha o seu <Em w="black">tipo</Em> de consórcio
					</h2>
				</div>

				<div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-3">
					{CARDS.map((card) => (
						<article
							key={card.id}
							className={`flex h-full flex-col overflow-hidden rounded-[12px] bg-[#FAFAF3] ${CARD_SHADOW}`}
						>
							{card.image ? (
								<div className={IMAGE_AREA_CLASS}>
									{/* Decoração coral ATRÁS do cutout, clipada pelo overflow do card — forma
									    dedicada do Figma por tipo (Carro e Imóvel: fita diagonal; Moto: anel). */}
									{card.decoration ? (
										<div
											aria-hidden="true"
											className={`pointer-events-none absolute inset-0 z-0 flex ${card.decoration.align ?? "items-center justify-center"}`}
										>
											{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
											<img
												src={`${KV}/${card.decoration.src}`}
												alt=""
												className={card.decoration.className}
											/>
										</div>
									) : null}
									{/* Cutout transparente FLUTUANDO sobre o coral: object-contain, sem caixa
									    retangular, sem crop. `scaleClassName` (opcional, por card) aplica um
									    zoom via classe Tailwind — não mexe no arquivo, só no "peso visual" na
									    tela. Pode ser responsivo (ex: "scale-125 md:scale-90"). */}
									<div
										className={`absolute inset-x-6 inset-y-4 z-10 ${card.image.scaleClassName ?? ""}`}
									>
										<Image
											src={`${KV}/${card.image.src}`}
											alt={card.image.alt}
											fill
											sizes="360px"
											className="object-contain"
										/>
									</div>
								</div>
							) : null}

							<div
								className={`flex flex-1 flex-col items-center px-5 pb-8 text-center ${
									card.image ? "pt-6" : "pt-10"
								}`}
							>
								<h3 className="text-[32px] font-normal leading-[1.05] text-[#052440] md:text-[44px] md:leading-[38px]">
									{card.title}
								</h3>
								<p className="mt-4 max-w-[280px] text-[16px] leading-[26px] text-[#2D2D2D]">
									<strong className="font-semibold">{card.descriptionLead}</strong>
									{card.descriptionRestLines.map((line, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: linhas fixas por card
										<span key={i}>
											{i > 0 || card.descriptionBreakAfterLead ? <br /> : null}
											{line}
										</span>
									))}
								</p>
								<KvCtaButton
									size="sm"
									onClick={(e) => onOpenChat(card.seed, e.currentTarget, "chip")}
									className="mt-6 min-h-[40px] px-5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2404F] focus-visible:ring-offset-2"
								>
									{card.button}
								</KvCtaButton>
								<div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
									{card.tags.map((tag) => (
										<span
											key={tag}
											className="whitespace-nowrap rounded-full border border-[#052440]/40 px-2.5 py-1 text-[12px] font-semibold leading-[16px] text-[#052440]"
										>
											{tag}
										</span>
									))}
								</div>
							</div>
						</article>
					))}
				</div>
			</KvContainer>
		</section>
	);
}
