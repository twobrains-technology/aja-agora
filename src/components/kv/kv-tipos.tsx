import Image from "next/image";

import { Em } from "@/components/kv/em";
import { SunBurst } from "@/components/kv/sun-burst";

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
	tags: string[];
	image: {
		src: string;
		alt: string;
	} | null;
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
		tags: ["Viagens", "Primeiro carro", "Autonomia"],
		image: {
			src: "image-3.png",
			alt: "Carro em estrada ao entardecer",
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
		tags: ["Sair do aluguel", "Casa própria", "Patrimônio"],
		image: {
			src: "image-1.png",
			alt: "Casa própria conquistada",
		},
	},
	{
		id: "moto",
		title: "Moto",
		descriptionLead: "Saia da moto alugada,",
		descriptionBreakAfterLead: true,
		descriptionRestLines: ["escape do trânsito ou realize", "o sonho da moto própria."],
		button: "Simular ofertas",
		tags: ["Trânsito", "Economia", "Mobilidade"],
		image: {
			src: "image-2.png",
			alt: "Motocicleta em destaque",
		},
	},
];

export function KvTipos() {
	return (
		// Painel navy FULL-BLEED: largura total da tela, cantos retos, sem margem cream
		// em volta (Figma: Rectangle 85 1442x963, x≈0). Só o CONTEÚDO fica no container
		// max-w centralizado. overflow-hidden clipa os ornamentos navy-claro do fundo.
		<section
			aria-labelledby="tipos-consorcio-heading"
			className="relative w-full overflow-hidden bg-[#021628]"
		>
			{/* Ornamentos navy tone-on-tone do painel — sutis, atrás de todo o conteúdo. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-[16%] top-0 z-0 h-[38%] w-[13%] rounded-b-[64px] bg-[#1C2E3E] md:left-[19%] md:w-[12%]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -bottom-[8%] right-[6%] z-0 h-[28%] w-[20%] rounded-t-[64px] bg-[#1C2E3E] md:right-[8%] md:w-[19%]"
			/>

			<div className="relative z-10 mx-auto max-w-[1320px] px-6 py-16 md:px-8 md:py-24">
				<div className="mx-auto max-w-[820px] text-center">
					<span className="text-[12px] font-semibold uppercase leading-[16px] tracking-wide text-[#F2404F]">
						qual a sua Propósito
					</span>
					<h2
						id="tipos-consorcio-heading"
						className="mt-3 text-[32px] font-normal leading-[1.15] text-white md:text-[44px] md:leading-[62px]"
					>
						Escolha o seu <Em w="black">tipo</Em> de consórcio
					</h2>
				</div>

				<div className="mt-12 grid gap-4 md:mt-16 md:grid-cols-3">
					{CARDS.map((card) => (
						<article
							key={card.id}
							className="flex h-full flex-col overflow-hidden rounded-[12px] bg-[#FAFAF3] shadow-[0_4px_16px_0_#00000014,0_12px_32px_-4px_#0000000A]"
						>
							{card.image ? (
								<div className={IMAGE_AREA_CLASS}>
									{/* SunBurst coral ATRÁS do cutout — raios grossos (rays 10) irradiando
									    ao redor do objeto inteiro, como no Figma. Clipado pelo overflow. */}
									<div
										aria-hidden="true"
										className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
									>
										<SunBurst rays={10} barWidth={22} className="aspect-square h-[130%] shrink-0" />
									</div>
									{/* Cutout transparente FLUTUANDO sobre o coral: object-contain, sem caixa
									    retangular, sem crop. */}
									<div className="absolute inset-x-6 inset-y-4 z-10">
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
								<button
									type="button"
									className="mt-6 inline-flex min-h-[40px] items-center justify-center rounded-full bg-[#F2404F] px-5 py-2.5 text-[12px] font-semibold leading-[16px] text-white transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2404F] focus-visible:ring-offset-2"
								>
									{card.button}
								</button>
								<div className="mt-6 flex flex-nowrap items-center justify-center gap-1.5">
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
			</div>
		</section>
	);
}
