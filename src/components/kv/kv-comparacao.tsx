import { Check, X } from "lucide-react";
import Image from "next/image";

import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

const KV = "/kv";

const CONSORCIO_ITEMS = [
	"Maior poder de compra no longo prazo.",
	"Taxa de administração fixa e diluída no plano.",
	"Carta de crédito atualizada conforme o contrato.",
	"Sem cobrança de juros.",
];

const FINANCIAMENTO_ITEMS: { text: string; positive: boolean }[] = [
	{ text: "Entrega do bem logo após a aprovação.", positive: true },
	{ text: "Juros compostos ao longo de todo o contrato.", positive: false },
	{ text: "Custo total pode ser muito superior ao valor do bem.", positive: false },
	{ text: "Parcelas mais altas devido aos juros.", positive: false },
];

/** Respiro entre a aresta reta do leque (burstSrc) e a foto — evita colar direto. */
const BURST_GAP = 10;
/** Tamanho do leque relativo ao diâmetro do medalhão (1 = mesma altura da foto). */
const BURST_SCALE = 0.8;

/**
 * Medalhão da coluna (Figma 'Group 106/107') — foto clipada em MEIA-LUA (a
 * metade direita de um círculo, com a aresta reta à esquerda) e um SVG
 * dedicado de leque atrás dela (`burstSrc` — semicírculo de raios já com a
 * aresta reta embutida no próprio arquivo, coral no lado Consórcio, cinza no
 * lado Financiamento), reproduzindo o Figma sem raio nenhum cruzando por cima
 * do corte reto da foto. Sem anel branco nem sombra (máscara direta, igual ao
 * Figma).
 *
 * A foto é renderizada num box "estourado" (maior que a janela visível,
 * controlado por `zoom` <1 = mais contexto/menos corte) pra caber o
 * rosto/gesto inteiro dentro da janela meia-lua estreita.
 *
 * A caixa externa é fixa em 260×260 pra que os dois medalhões alinhem os
 * rótulos e as listas por baixo; o medalhão do Financiamento é ~15% menor e
 * desce ~21px dentro dessa caixa, reproduzindo a assimetria do blueprint
 * (Group 106 260×268 @y168 · Group 107 220×227 @y189).
 */
function Medalhao({
	src,
	burstSrc,
	diameter,
	topOffset = 0,
	objectPosition,
	zoom = 1,
}: {
	src: string;
	burstSrc: string;
	diameter: number;
	topOffset?: number;
	objectPosition: string;
	zoom?: number;
}) {
	const half = diameter / 2;
	// object-fit:cover só depende da proporção da caixa — escalar largura E
	// altura igualmente não muda o corte (mesma razão de aspecto). Pra
	// "zoom out" de verdade, alarga só a LARGURA (o container já é
	// estreito/alto e é a altura que domina o cover); a altura fica em
	// 100% pra não sobrar vão vertical.
	const wrapPct = 100 / zoom;
	const wrapOffset = -(wrapPct - 100) / 2;
	return (
		<div className="relative mx-auto mb-6 h-[260px] w-[260px]">
			<div
				className="absolute left-1/2 -translate-x-1/2"
				style={{ width: diameter, height: diameter, top: topOffset }}
			>
				{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
				<img
					src={burstSrc}
					alt=""
					aria-hidden="true"
					// Aresta reta do leque já é a borda direita do próprio SVG — alinhada
					// com `right-1/2` (= `half`, a mesma linha onde a foto começa) mais um
					// respiro (BURST_GAP) pra não colar direto na foto.
					className="pointer-events-none absolute top-1/2 w-auto -translate-y-1/2"
					style={{ right: `calc(50% + ${BURST_GAP}px)`, height: diameter * BURST_SCALE }}
				/>
				<div
					className="absolute right-0 top-0 overflow-hidden rounded-r-full"
					style={{ width: half, height: diameter }}
				>
					<div
						className="absolute inset-y-0"
						style={{
							width: `${wrapPct}%`,
							left: `${wrapOffset}%`,
						}}
					>
						<Image
							src={src}
							alt=""
							fill
							sizes="200px"
							className="object-cover"
							style={{ objectPosition }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

// Frame 'Consórcio vs Financiamento' (Group 131): header centralizado + duas
// colunas comparativas — Financiamento (à esquerda, com X coral nos itens
// negativos) e Consórcio (à direita, só checks verdes). Cada coluna tem seu
// próprio medalhão meia-lua com sunburst (coral no Consórcio, cinza no
// Financiamento). Os assets vêm do .fig (blueprint Group 106/107 + img-manifest):
// o jovem pensativo de camiseta bordô e mochila (arquivo 'paint-brush-2', mão na
// testa — reforça o "sem planejamento") no lado Financiamento; e o rapaz sorrindo
// de fone/jaqueta jeans (arquivo 'headphones-un') no lado Consórcio.
export function KvComparacao() {
	return (
		<section aria-labelledby="comparacao-heading" className="bg-[#FAFAF3]">
			<KvContainer className="max-w-[1120px] py-16 md:py-24">
				<div className="mx-auto max-w-[700px] text-center">
					<KvEyebrow className="tracking-[0.16em]">COMO FUNCIONA</KvEyebrow>
					<h2
						id="comparacao-heading"
						className="mt-3 text-[32px] font-normal leading-[1.15] text-[#021628] md:text-[44px] md:leading-[62px]"
					>
						Consórcio <Em>vs</Em> financiamento
					</h2>
					<p className="mx-auto mt-4 max-w-[560px] text-[16px] leading-[26px] text-[#6B6B66]">
						Compare custos, prazos e vantagens de cada modalidade para escolher a alternativa mais
						inteligente para o seu momento.
					</p>
				</div>

				<div className="mt-12 grid gap-12 md:mt-16 md:grid-cols-2 md:gap-x-16">
					{/* Coluna Financiamento — à esquerda (e primeiro no DOM/mobile) */}
					<div className="flex flex-col items-center text-center">
						<Medalhao
							src={`${KV}/smiling-young-caucasian-woman-holds-paint-brush-2.jpg`}
							burstSrc={`${KV}/consorcio-burst-cinza.svg`}
							diameter={221}
							topOffset={21}
							objectPosition="55% 15%"
							zoom={0.7}
						/>
						{/* Cinza (não KvEyebrow — o átomo é hardcoded vermelho; aqui a cor é
						    semântica: lado negativo da comparação, não o eyebrow de seção). */}
						<span className="text-[12px] font-semibold uppercase leading-[16px] tracking-[0.16em] text-[#6B6B66]">
							sem planejamento
						</span>
						<h3 className="mt-2 text-[28px] font-normal leading-[1.15] text-[#052440] md:text-[32px] md:leading-[38px]">
							Financiamento
						</h3>
						<ul className="mt-8 flex flex-col items-start gap-4 md:items-center">
							{FINANCIAMENTO_ITEMS.map((item) => (
								<li key={item.text} className="flex w-fit items-center gap-3.5">
									<span
										className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
											item.positive ? "bg-[#22B464]" : "bg-[#F2404F]"
										}`}
									>
										{item.positive ? (
											<Check className="size-3.5 text-white" strokeWidth={3} />
										) : (
											<X className="size-3.5 text-white" strokeWidth={3} />
										)}
									</span>
									<p className="text-left text-[16px] leading-[24px] text-[#052440]">{item.text}</p>
								</li>
							))}
						</ul>
					</div>

					{/* Coluna Consórcio — à direita */}
					<div className="flex flex-col items-center text-center">
						<Medalhao
							src={`${KV}/hispanic-young-man-smiling-wearing-headphones-un.jpg`}
							burstSrc={`${KV}/consorcio-burst-vermelho.svg`}
							diameter={260}
							objectPosition="55% 15%"
							zoom={0.7}
						/>
						<KvEyebrow className="tracking-[0.16em]">pode organizar a jornada</KvEyebrow>
						<h3 className="mt-2 text-[28px] font-normal leading-[1.15] text-[#052440] md:text-[32px] md:leading-[38px]">
							Consórcio Ideal para você
						</h3>
						<ul className="mt-8 flex flex-col items-start gap-4 md:items-center">
							{CONSORCIO_ITEMS.map((item) => (
								<li key={item} className="flex w-fit items-center gap-3.5">
									<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#22B464]">
										<Check className="size-3.5 text-white" strokeWidth={3} />
									</span>
									<p className="text-left text-[16px] leading-[24px] text-[#052440]">{item}</p>
								</li>
							))}
						</ul>
					</div>
				</div>
			</KvContainer>
		</section>
	);
}
