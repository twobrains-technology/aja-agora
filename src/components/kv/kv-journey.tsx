import type { ReactNode } from "react";

import { SunMark } from "@/components/brand/sun-mark";
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
	/** Desktop: topo do bloco de texto (a pilha é centrada no eixo do ícone). */
	textY: number;
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
		// Figma (Frame 111, auto V gap:15): o texto fica ACIMA do ícone com
		// ~15px de folga — nunca sobreposto. Com o título em 1 linha (nowrap),
		// a pilha termina em ~227px, deixando o círculo (topo em 255) livre.
		textY: 90,
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
		textY: 488,
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
		textY: 11,
		textW: 364,
	},
	{
		eyebrow: "contemplação",
		title: "Sorteio ou Lance",
		description: "Com a contemplação, você recebe a carta de crédito para negociar sua compra.",
		emoji: "🚀",
		iconX: 726,
		iconY: 456,
		textY: 511,
		textW: 278,
	},
	{
		eyebrow: "Receba seu crédito",
		title: "Carta de Crédito",
		description: "Você recebe a carta de crédito para negociar sua compra.",
		emoji: "💳",
		iconX: 931,
		iconY: 178,
		textY: 13,
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
		textY: 426,
		textW: 255,
	},
];

// "AJA" — glifos reais da marca (mesmos vetores do lockup, top-row do wordmark),
// usados dentro do círculo navy sob o sol. Sem depender de fonte.
function AjaGlyphs({ className }: { className?: string }) {
	return (
		<svg viewBox="168 163 533 162" fill="#fff" aria-hidden="true" className={className}>
			<polygon points="215.29 323.78 275.58 214.54 335.47 323.78 382.3 323.78 294.76 166.11 255.64 166.11 168.87 323.78 215.29 323.78" />
			<path d="M456.44,163.77v60.32c0,33.62-27.35,60.97-60.97,60.97-7.1,0-13.89-1.28-20.21-3.55l-.35.35,23.13,41.67c53.7-1.38,96.99-45.4,96.99-99.44v-60.32h-38.6Z" />
			<polygon points="533.64 323.22 593.94 213.98 653.82 323.22 700.65 323.22 613.12 165.55 573.99 165.55 487.22 323.22 533.64 323.22" />
		</svg>
	);
}

// Marca AJA branca (raios + "AJA") centralizada no círculo navy — reproduz o
// Group 125 do Figma (Group 124 raios + Group 122 letras). NÃO é o SunMark solto.
function AjaBrandMark() {
	return (
		<span className="flex flex-col items-center justify-center leading-none">
			<SunMark variant="white" aria-hidden="true" className="w-[54%]" />
			<AjaGlyphs className="-mt-[1px] w-[50%]" />
		</span>
	);
}

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

// Círculo do ícone (branco + emoji, ou navy + marca AJA no passo Desenrolamos).
function StepCircle({ step, size }: { step: JourneyStep; size: number }) {
	if (step.brand) {
		return (
			<div
				className={`flex items-center justify-center rounded-full bg-[#052440] ${CARD_SHADOW}`}
				style={{ width: size, height: size }}
			>
				<AjaBrandMark />
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
		<section className="relative overflow-hidden bg-gradient-to-b from-[#F4F4E2] to-[#FAFAF3] py-14 lg:py-28">
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
				<ol className="relative mt-10 flex flex-col items-center lg:hidden">
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
							<StepCircle step={step} size={90} />
						</div>
					))}

					{/* Blocos de texto */}
					{STEPS.map((step) => (
						<div
							key={`text-${step.title}`}
							className="absolute z-10 -translate-x-1/2 text-center"
							style={{
								left: `${(step.iconX / CANVAS_W) * 100}%`,
								top: `${(step.textY / CANVAS_H) * 100}%`,
								width: `${(step.textW / CANVAS_W) * 100}%`,
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
					))}
				</div>
			</KvContainer>
		</section>
	);
}
