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
const BURST_GAP = 12;
/** O leque fica só 5px mais baixo que a foto (quase a mesma altura, não um leque bem menor). */
const BURST_SIZE_DELTA = 30;

/**
 * Medalhão da coluna (Figma 'Group 106/107') — foto já pronta em meia-lua
 * (PNG do design, sem clip/zoom em runtime) com um leque de raios (SVG
 * dedicado, coral no Consórcio / cinza no Financiamento) atrás dela. A foto
 * já traz a transparência e o corte certos — só posiciona no mesmo lugar
 * onde antes ficava a janela recortada manualmente.
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
	nativeWidth,
	nativeHeight,
}: {
	src: string;
	burstSrc: string;
	diameter: number;
	topOffset?: number;
	nativeWidth: number;
	nativeHeight: number;
}) {
	return (
		<div className="relative mx-auto mb-4 h-[260px] w-[260px]">
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
					style={{ right: `calc(50% + ${BURST_GAP}px)`, height: diameter - BURST_SIZE_DELTA }}
				/>
				<Image
					src={src}
					alt=""
					aria-hidden="true"
					width={nativeWidth}
					height={nativeHeight}
					className="absolute right-0 top-0"
					style={{ height: diameter, width: "auto" }}
				/>
			</div>
		</div>
	);
}

// Frame 'Consórcio vs Financiamento' (Group 131): header centralizado + duas
// colunas comparativas — Financiamento (à esquerda, com X coral nos itens
// negativos) e Consórcio (à direita, só checks verdes). Cada coluna tem seu
// próprio medalhão meia-lua (menino-sol-cinza no Financiamento, menino-sol-
// vermelho no Consórcio — PNG do design, já recortado, sem clip/zoom em
// runtime) com o leque de raios (SVG dedicado) atrás.
export function KvComparacao() {
	return (
		<section aria-labelledby="comparacao-heading" className="relative bg-[#FAFAF3]">
			{/* Blob coral desfocado, canto superior direito — mesma peça do Hero,
			    marcando a transição vindo da seção "Saúde financeira" (Figma: 720x757).
			    SEM nenhum overflow na seção (de propósito, e importante: `overflow-x-
			    hidden` sozinho NÃO funciona aqui — por spec do CSS, se um eixo vira
			    algo != visible o outro eixo visible vira "auto" implicitamente, então
			    overflow-x-hidden estava silenciosamente cortando o vazamento vertical
			    também, sem scrollbar visível pra denunciar). Sem overflow nenhum, o
			    blob vaza livre pra cima — SEM z-index (empilhamento padrão: fica atrás
			    do painel navy da seção anterior e de qualquer card/imagem, só aparece
			    nos vãos de fundo, nunca por cima de conteúdo real). Horizontal em
			    `right-0` (dentro dos limites da viewport) em vez de bleed pra fora,
			    pra não abrir scroll horizontal. blur/opacity reduzidos do valor
			    literal do Figma (334.8/.95) pra 260/85%: com blur tão alto a cor
			    ficava quase imperceptível. */}
			<div className="pointer-events-none absolute -top-[230px] right-0 h-[870px] w-[830px] rounded-full bg-[#FFE0E3] opacity-85 blur-[260px]" />

			<KvContainer className="relative z-20 max-w-[1120px] py-6 md:py-8">
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

				<div className="mt-8 grid gap-8 md:mt-10 md:grid-cols-2 md:gap-x-12">
					{/* Coluna Financiamento — à esquerda (e primeiro no DOM/mobile) */}
					<div className="flex flex-col items-center text-center">
						<Medalhao
							src={`${KV}/menino-sol-cinza.png`}
							burstSrc={`${KV}/consorcio-burst-cinza.svg`}
							diameter={221}
							topOffset={21}
							nativeWidth={466}
							nativeHeight={909}
						/>
						{/* Cinza (não KvEyebrow — o átomo é hardcoded vermelho; aqui a cor é
						    semântica: lado negativo da comparação, não o eyebrow de seção). */}
						<span className="text-[12px] font-semibold uppercase leading-[16px] tracking-[0.16em] text-[#6B6B66]">
							sem planejamento
						</span>
						<h3 className="mt-2 text-[28px] font-normal leading-[1.15] text-[#052440] md:text-[32px] md:leading-[38px]">
							Financiamento
						</h3>
						<ul className="mt-5 flex flex-col items-start gap-3 md:items-center">
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
							src={`${KV}/menino-sol-vermelho.png`}
							burstSrc={`${KV}/consorcio-burst-vermelho.svg`}
							diameter={260}
							nativeWidth={550}
							nativeHeight={1073}
						/>
						<KvEyebrow className="tracking-[0.16em]">pode organizar a jornada</KvEyebrow>
						<h3 className="mt-2 text-[28px] font-normal leading-[1.15] text-[#052440] md:text-[32px] md:leading-[38px]">
							Consórcio Ideal para você
						</h3>
						<ul className="mt-5 flex flex-col items-start gap-3 md:items-center">
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
