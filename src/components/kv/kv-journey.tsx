import type { ReactNode } from "react";

import { Em } from "@/components/kv/em";
import { CARD_SHADOW, KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

type JourneyStep = {
	eyebrow: string;
	title: string;
	description: string;
	/** Palavra do corpo com ênfase coral (Figma: "adequado", "Sonho"). */
	emphasis?: string;
	/** Emoji do passo (todos menos "Desenrolamos", que usa a marca AJA). */
	emoji?: string;
	/** Passo com o ícone de marca (círculo navy + marca AJA: raios + letras). */
	brand?: boolean;
	/**
	 * Desktop: centro do ícone no canvas de 1240x680 (coords escaladas do Figma).
	 */
	iconX: number;
	iconY: number;
	/** Desktop: largura da coluna de texto (escala do Figma) no mesmo canvas. */
	textW: number;
};

// Mobile: sunburst coral — 1 SVG só (journey-burst.svg), reusado em cadeia
// como uma "minhoca": um raio por vão entre passos consecutivos (exceto o
// último passo, que só recebe o sangramento do penúltimo), alternando de lado
// a cada vão, colado na borda da tela (left-0/right-0). O TOPO do SVG começa
// no centro do ícone do passo atual e estica pra baixo em direção ao próximo
// ícone — não fica centralizado num ícone só. Ajuste `JOURNEY_BURST_HEIGHT`/
// `JOURNEY_BURST_WIDTH` à mão pra afinar o encaixe entre os ícones.
const JOURNEY_BURST_COUNT = 5;
const JOURNEY_BURST_WIDTH = 160;
const JOURNEY_BURST_HEIGHT = 350;
/** Centro do círculo (80px) dentro do `<li>`: sem conector (1º passo) = metade
 *  do círculo; com conector (h-16 = 64px) antes do círculo = 64 + metade. */
const BURST_CENTER_NO_CONNECTOR = 40;
const BURST_CENTER_WITH_CONNECTOR = 104;

// Canvas do desktop (largura x altura) sobre o qual as coordenadas do Figma
// (frame 1440) foram escaladas por 0.861 e reposicionadas. Ícones e texto são
// posicionados em % desse canvas para preservar a serpentina fiel ao Figma.
const CANVAS_W = 1240;
const CANVAS_H = 680;

// Ícone (desktop) e o gap fixo texto↔ícone (Figma Frame 111, auto V gap: 15).
// O bloco de texto de cada passo é ancorado pelo lado OPOSTO ao ícone (pico =
// texto acima → ancora por `bottom`; vale = texto abaixo → ancora por `top`),
// nunca pelo lado que cresce em direção ao ícone. Isso garante o mesmo gap em
// todos os passos, mesmo com descrições de tamanhos diferentes (uma pilha mais
// alta cresce pra LONGE do ícone, não em cima dele — antes disso, alguns
// textos mais longos ficavam colados no ícone).
const DESKTOP_ICON_SIZE = 90;
const DESKTOP_ICON_RADIUS = DESKTOP_ICON_SIZE / 2;
const TEXT_ICON_GAP = 15;

// journey-aja-badge.svg (passo "Desenrolamos"): asset final com sombra própria
// embutida (filter no SVG) — viewBox 161x161, círculo navy <circle cx="80.5"
// cy="68.5" r="52.5"/> NÃO centralizado no canvas (sombra bleeds mais embaixo).
// StepCircle usa esses valores pra reposicionar a SVG de volta ao centro de
// uma caixa `size`×`size`, igual aos outros ícones (ver comentário lá).
const AJA_BADGE_VIEWBOX = 161;
const AJA_BADGE_CIRCLE_DIAMETER = 105;
const AJA_BADGE_CIRCLE_CX = 80.5;
const AJA_BADGE_CIRCLE_CY = 68.5;

// Ordem fiel ao blueprint (frame "Jornada - Como Funciona"):
// objetivo → analisamos (Desenrolamos) → fundo comum → sorteio/lance →
// carta de crédito → objetivo realizado. Os centros dos ícones formam um
// zigue-zague (pico/vale) por onde passa a onda coral em S.
const STEPS: JourneyStep[] = [
	{
		eyebrow: "Você conta seu objetivo",
		title: "Inicia a jornada",
		description: "Tudo começa pelo seu objetivo e pelo valor que faz sentido o seu bolso.",
		emoji: "🎯",
		iconX: 200,
		iconY: 300,
		textW: 220,
	},
	{
		eyebrow: "analisamos alternativas",
		title: "Desenrolamos",
		description:
			"Analisamos taxas, prazos, regras e condições para encontrar o que é mais adequado para você! Depois, é só você escolher!",
		emphasis: "adequado",
		brand: true,
		iconX: 310,
		iconY: 432,
		textW: 341,
	},
	{
		eyebrow: "Você entra em um grupo",
		title: "Fundo comum",
		description:
			"Depois da contratação, você passa a integrar um grupo de consórcio administrado por uma empresa autorizada pelo Banco Central.",
		emoji: "🤝",
		iconX: 515,
		iconY: 217,
		textW: 364,
	},
	{
		eyebrow: "contemplação",
		title: "Sorteio ou Lance",
		description: "Com a contemplação, você recebe a carta de crédito para negociar sua compra.",
		emoji: "🚀",
		iconX: 726,
		iconY: 456,
		textW: 278,
	},
	{
		eyebrow: "Receba seu crédito",
		title: "Carta de Crédito",
		description: "Você recebe a carta de crédito para negociar sua compra.",
		emoji: "💳",
		iconX: 931,
		iconY: 178,
		textW: 269,
	},
	{
		eyebrow: "planejado e organizado",
		title: "Objetivo Realizado",
		description: "Pronto! Você conquistou seu Sonho com transparência e segurança!",
		emphasis: "Sonho",
		emoji: "🏆",
		iconX: 1030,
		iconY: 356,
		textW: 255,
	},
];

// Corpo do passo com a palavra-chave em coral (Figma: "adequado" / "Sonho").
function StepDescription({ text, emphasis }: { text: string; emphasis?: string }): ReactNode {
	if (!emphasis) return text;
	const at = text.indexOf(emphasis);
	if (at === -1) return text;
	return (
		<>
			{text.slice(0, at)}
			<span className="font-semibold text-[#F2404F]">{emphasis}</span>
			{text.slice(at + emphasis.length)}
		</>
	);
}

// Círculo do ícone (branco + emoji, ou o badge AJA no passo Desenrolamos).
function StepCircle({ step, size }: { step: JourneyStep; size: number }) {
	if (step.brand) {
		// Caixa exata `size`×`size` (igual aos outros ícones) — a SVG (maior, pra
		// caber a sombra) fica absoluta dentro dela, deslocada pra que o círculo
		// navy (não centralizado no viewBox) caia bem no centro da caixa. Sem
		// isso, o ícone ficava maior que os outros e com espaçamento de texto
		// diferente (o gap é calculado em cima do centro/raio desta caixa).
		const badgeSize = size * (AJA_BADGE_VIEWBOX / AJA_BADGE_CIRCLE_DIAMETER);
		const offsetLeft = size * (0.5 - AJA_BADGE_CIRCLE_CX / AJA_BADGE_CIRCLE_DIAMETER);
		const offsetTop = size * (0.5 - AJA_BADGE_CIRCLE_CY / AJA_BADGE_CIRCLE_DIAMETER);
		return (
			<div className="relative" style={{ width: size, height: size }}>
				{/* biome-ignore lint/performance/noImgElement: SVG estático com sombra própria embutida */}
				<img
					src="/kv/journey-aja-badge.svg"
					alt=""
					aria-hidden="true"
					// max-w-none: o Preflight do Tailwind põe `max-width:100%` em <img> —
					// como essa SVG é DELIBERADAMENTE maior que a caixa `size` que a
					// contém (pra caber a sombra), esse limite encolhia o círculo junto.
					className="absolute max-w-none"
					style={{ width: badgeSize, height: badgeSize, left: offsetLeft, top: offsetTop }}
				/>
			</div>
		);
	}
	return (
		<div
			className={`flex items-center justify-center rounded-full bg-[#FEFEFD] ${CARD_SHADOW}`}
			style={{ width: size, height: size }}
		>
			<span
				aria-hidden="true"
				className="leading-none"
				style={{ fontSize: Math.round(size * 0.48) }}
			>
				{step.emoji}
			</span>
		</div>
	);
}

// Faixa coral serpentina (raios) que liga os 6 passos, ATRÁS dos círculos —
// SVG dedicado (journey-wave.svg) com os raios já desenhados pelo Figma, no
// lugar da antiga aproximação por stroke tracejado. journey-wave.svg está na
// escala NATIVA do Figma (não pré-escalada) — mesma escala 0.861 usada nos
// ícones (ver comentário de CANVAS_W acima) reposiciona o desenho no canvas.
const WAVE_BOX = { left: 170, top: 169, width: 893, height: 297 };

// Jornada - Como Funciona: eyebrow + título centralizados, seguidos dos 6 passos.
//
// Mobile (<lg): coluna única centralizada, círculo de 80px por passo, conector
// vertical fino, sunbursts coral sangrando pela borda esquerda, blobs rosa.
//
// Desktop (lg+): os 6 passos posicionados em absoluto formando uma onda em S,
// ligados por uma faixa coral de raios (a "jornada"), com o texto acima (picos)
// e abaixo (vales).
export function KvJourney() {
	return (
		<section className="relative overflow-hidden bg-gradient-to-b from-[#F4F4E2] to-[#FAFAF3] py-6 lg:py-8">
			{/* Blobs rosa de fundo (mobile) */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-24 right-8 size-[300px] rounded-full bg-[#FFE0E3] opacity-60 blur-[80px] lg:hidden"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -left-28 top-[60%] size-[300px] rounded-full bg-[#FFE0E3] opacity-60 blur-[80px] lg:hidden"
			/>

			<KvContainer className="max-w-[1240px]">
				{/* Cabeçalho centralizado (eyebrow + título) */}
				<div className="mx-auto max-w-[815px] text-center">
					<KvEyebrow>Como funciona</KvEyebrow>
					<h2 className="mt-3 text-[32px] font-normal leading-[44px] text-[#021628] lg:text-[44px] lg:leading-[62px]">
						Uma jornada em poucos <Em>Movimentos</Em>
					</h2>
				</div>

				{/* Mobile/tablet (<lg): coluna única, conector vertical entre os passos */}
				<ol className="relative mt-8 flex flex-col items-center lg:hidden">
					{STEPS.map((step, index) => (
						<li key={step.title} className="relative flex flex-col items-center text-center">
							{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
							{index < JOURNEY_BURST_COUNT && (
								<img
									src="/kv/journey-burst.svg"
									alt=""
									aria-hidden="true"
									className={`pointer-events-none absolute lg:hidden ${
										index % 2 === 0 ? "" : "-scale-x-100"
									}`}
									style={{
										width: JOURNEY_BURST_WIDTH,
										height: JOURNEY_BURST_HEIGHT,
										top: index === 0 ? BURST_CENTER_NO_CONNECTOR : BURST_CENTER_WITH_CONNECTOR,
										// `<li>` não tem a largura da viewport (encolhe pro conteúdo, ~320px
										// centralizado) — left-0/right-0 ficariam presos na borda do <li>, não
										// na borda real da tela. Esse calc quebra pra fora até a borda real,
										// desde que o <li> esteja centralizado na viewport (flex items-center).
										...(index % 2 === 0
											? { right: "calc(50% - 50vw)" }
											: { left: "calc(50% - 50vw)" }),
									}}
								/>
							)}
							{index > 0 && <span aria-hidden="true" className="h-16 w-px bg-[#F2404F]/25" />}
							<div className="relative z-10">
								<StepCircle step={step} size={80} />
							</div>
							<div className="relative z-10 mt-4 max-w-[320px]">
								<KvEyebrow className="text-[11px] leading-normal">{step.eyebrow}</KvEyebrow>
								<h3 className="mt-2 text-[22px] font-normal leading-[28px] text-[#021628]">
									{step.title}
								</h3>
								<p className="mt-2 text-[14px] leading-[22px] text-[#2D2D2D]">
									<StepDescription text={step.description} emphasis={step.emphasis} />
								</p>
							</div>
						</li>
					))}
				</ol>

				{/* Desktop (lg+): onda em S, faixa coral de raios ligando os 6 passos */}
				<div
					className="relative mx-auto mt-8 hidden w-full max-w-[1240px] lg:block"
					style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
				>
					{/* Faixa coral serpentina (raios) atrás dos círculos */}
					{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
					<img
						src="/kv/journey-wave.svg"
						alt=""
						aria-hidden="true"
						className="pointer-events-none absolute"
						style={{
							left: `${(WAVE_BOX.left / CANVAS_W) * 100}%`,
							top: `${(WAVE_BOX.top / CANVAS_H) * 100}%`,
							width: `${(WAVE_BOX.width / CANVAS_W) * 100}%`,
							height: `${(WAVE_BOX.height / CANVAS_H) * 100}%`,
						}}
					/>

					{/* Círculos dos passos (sobre a faixa) */}
					{STEPS.map((step) => (
						<div
							key={`icon-${step.title}`}
							className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
							style={{
								left: `${(step.iconX / CANVAS_W) * 100}%`,
								top: `${(step.iconY / CANVAS_H) * 100}%`,
							}}
						>
							<StepCircle step={step} size={DESKTOP_ICON_SIZE} />
						</div>
					))}

					{/* Blocos de texto — pico (índice par) ancora pelo `bottom` e cresce
					    pra cima; vale (índice ímpar) ancora pelo `top` e cresce pra baixo.
					    Nunca o lado que cresceria em direção ao ícone. */}
					{STEPS.map((step, index) => {
						const isAbove = index % 2 === 0;
						const edgeY = isAbove
							? step.iconY - DESKTOP_ICON_RADIUS - TEXT_ICON_GAP
							: step.iconY + DESKTOP_ICON_RADIUS + TEXT_ICON_GAP;
						return (
							<div
								key={`text-${step.title}`}
								className="absolute z-10 -translate-x-1/2 text-center"
								style={{
									left: `${(step.iconX / CANVAS_W) * 100}%`,
									width: `${(step.textW / CANVAS_W) * 100}%`,
									...(isAbove
										? { bottom: `${((CANVAS_H - edgeY) / CANVAS_H) * 100}%` }
										: { top: `${(edgeY / CANVAS_H) * 100}%` }),
								}}
							>
								<KvEyebrow className="leading-normal">{step.eyebrow}</KvEyebrow>
								<h3 className="mt-2 whitespace-nowrap text-[27px] font-normal leading-[32px] text-[#052440]">
									{step.title}
								</h3>
								<p className="mt-3 text-[14px] leading-[23px] text-[#2D2D2D]">
									<StepDescription text={step.description} emphasis={step.emphasis} />
								</p>
							</div>
						);
					})}
				</div>
			</KvContainer>
		</section>
	);
}
