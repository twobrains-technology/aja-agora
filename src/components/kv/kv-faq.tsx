"use client";

import { useId, useState } from "react";

import { Em } from "@/components/kv/em";

const FAQ_ITEMS = [
	{
		question: "Consórcio é seguro?",
		summary: "Autorizada pelo Banco Central...",
	},
	{
		question: "Quanto tempo demora para ser contemplado?",
		summary: "Autorizada pelo Banco Central...",
	},
	{
		question: "Posso usar FGTS no consórcio?",
		summary: "Descubra em quais situações o FGTS pode ser utilizado...",
	},
	{
		question: "Atrasei uma parcela do consórcio. E agora?",
		summary: "Descubra em quais situações o FGTS pode ser utilizado...",
	},
	{
		question: "Posso vender minha carta de crédito?",
		summary: "Entenda quando é possível transferir...",
	},
] as const;

// Perguntas Frequentes (Figma frame 'Perguntas Frequentes' 1437x815): bloco
// cream full-bleed com eyebrow + título à esquerda e accordion de 5 perguntas.
export function KvFaq() {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const baseId = useId();
	const patternId = useId();

	return (
		<section className="relative overflow-hidden bg-[#F2F2DB] pt-16 pb-16 md:pt-20 md:pb-40">
			{/*
				Group 38 do Figma é um asset vetorial (padrão denso de chevrons, 566x815) que
				o Framelink MCP não exportou (rate-limited). Aproximação por SVG tileado: chevrons
				pequenos e densos, ponta em miter (não arredondada), tom areia baixa opacidade —
				mais próximo do raio-x que deu pra medir no render do Figma. Forma exata (variação
				de tom/direção por banda) fica como limitação de asset registrada no report.
			*/}
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 right-0 hidden w-[40%] max-w-[566px] md:block"
				viewBox="0 0 566 815"
				preserveAspectRatio="xMidYMid slice"
			>
				<defs>
					<pattern id={patternId} width="97" height="145" patternUnits="userSpaceOnUse">
						<path
							d="M21 14 L76 72 L21 131 M118 14 L173 72 L118 131"
							fill="none"
							stroke="#E4E2D6"
							strokeWidth="14"
							strokeLinecap="butt"
							strokeLinejoin="miter"
						/>
					</pattern>
				</defs>
				<rect width="566" height="815" fill={`url(#${patternId})`} opacity="0.35" />
			</svg>

			<div className="relative mx-auto max-w-[1437px] px-6 md:px-12 lg:px-[102px]">
				<div className="relative max-w-[500px]">
					<span className="text-[12px] font-semibold uppercase leading-4 tracking-[0.2em] text-[#F2404F]">
						dúvidas para quem tá começando a jornada
					</span>
					<h2 className="mt-3 text-[32px] font-normal leading-[1.15] text-[#021628] md:text-[44px] md:leading-[62px]">
						<Em>Perguntas</Em> Frequentes
					</h2>
				</div>

				<ul className="relative mt-8 flex flex-col gap-3 md:mt-12">
					{FAQ_ITEMS.map((item, index) => {
						const isOpen = openIndex === index;
						const panelId = `${baseId}-panel-${index}`;
						const buttonId = `${baseId}-trigger-${index}`;

						return (
							<li key={item.question} className="overflow-hidden rounded-[12px] bg-[#FAFAF3]">
								<button
									id={buttonId}
									type="button"
									onClick={() => setOpenIndex(isOpen ? null : index)}
									aria-expanded={isOpen}
									aria-controls={panelId}
									className="flex min-h-[77px] w-full items-center justify-between gap-4 px-5 py-4 text-left md:px-[21px]"
								>
									<div className="flex flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-5">
										<span className="text-[20px] font-normal leading-[1.2] text-[#052440] lg:text-[32px] lg:leading-[38px]">
											{item.question}
										</span>
										<span className="hidden max-w-[400px] shrink-0 text-[14px] font-light leading-5 text-[#6B6B66] lg:block">
											{item.summary}
										</span>
									</div>
									<svg
										aria-hidden="true"
										viewBox="0 0 23 11"
										fill="none"
										className={`h-[11px] w-[23px] shrink-0 transition-transform duration-200 ${
											isOpen ? "rotate-180" : ""
										}`}
									>
										<path
											d="M1.5 1.5L11.5 9.5L21.5 1.5"
											stroke="#F2404F"
											strokeWidth="3"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</button>
								{isOpen && (
									<section id={panelId} aria-labelledby={buttonId} className="px-5 pb-5 md:px-6">
										<p className="max-w-[760px] text-[16px] font-normal leading-[1.5] text-[#2D2D2D]">
											{item.summary}
										</p>
									</section>
								)}
							</li>
						);
					})}
				</ul>
			</div>
		</section>
	);
}
