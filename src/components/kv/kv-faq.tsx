"use client";

import { useId, useState } from "react";

import { Em } from "@/components/kv/em";
import { FAQ_GERAL, type KvFaqItem } from "@/components/kv/faq-catalogo";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

export type { KvFaqItem };

/** Recorte da home: as perguntas gerais, antes de a pessoa escolher o bem. */
export const FAQ_ITEMS = FAQ_GERAL;

// Perguntas Frequentes (Figma frame 'Perguntas Frequentes' 1437x815): bloco
// cream full-bleed com eyebrow + título à esquerda e accordion de perguntas.
//
// As landings de vertical (`/autos`, `/imoveis` e `/motos`) reusam esta mesma seção passando um
// recorte próprio de `itens` — no comp o eyebrow e o título são idênticos aos
// da home, então só a lista muda.
export function KvFaq({ itens = FAQ_ITEMS }: { itens?: readonly KvFaqItem[] } = {}) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const baseId = useId();

	return (
		// py-24: no comp a faixa creme tem ~96px de respiro em cima e embaixo. Com
		// py-8 a seção saía 141px mais curta que o frame, em todas as páginas.
		<section className="relative overflow-hidden bg-[#F2F2DB] py-12 md:py-24">
			{/* Padrão de chevron do comp. Veio exportado sobre BRANCO (JPG, sem alfa),
			    então entra em `mix-blend-multiply`: o branco não altera o creme da
			    seção e só os chevrons cinzas escurecem.
			    UM ladrilho só, encostado à direita e com a altura da seção — sem
			    repetir. O arquivo tem a proporção da faixa do comp, então nessa altura
			    ele cobre ~830px e para sozinho por volta de x=610, que é onde o comp
			    para. Com `repeat-x` sobrava uma tira estreita à esquerda e a repetição
			    a preenchia com meio chevron, deixando uma emenda vertical dura. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 hidden mix-blend-multiply md:block"
				style={{
					backgroundImage: "url(/kv/fundo-faq-chevron.jpg)",
					backgroundSize: "auto 100%",
					backgroundRepeat: "no-repeat",
					backgroundPosition: "right center",
				}}
			/>

			<KvContainer className="max-w-[1437px] md:px-12 lg:px-[102px]">
				<div className="relative max-w-[500px]">
					<KvEyebrow className="tracking-[0.2em]">
						dúvidas para quem tá começando a jornada
					</KvEyebrow>
					<h2 className="mt-3 text-[32px] font-normal leading-[1.15] text-[#021628] md:text-[44px] md:leading-[62px]">
						<Em>Perguntas</Em> Frequentes
					</h2>
				</div>

				<ul className="relative mt-6 flex flex-col gap-3 md:mt-8">
					{itens.map((item, index) => {
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
									<div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-4">
										<span className="text-[20px] font-normal leading-[1.2] text-[#052440] lg:shrink-0 lg:text-[32px] lg:leading-[38px]">
											{item.question}
										</span>
										{/* Quem cede é o resumo, nunca a pergunta: numa linha estreita ele
										    ganha reticências em vez de escorregar por baixo do chevron e
										    ser decepado pelo `overflow-hidden` do item. */}
										<span className="hidden min-w-0 truncate text-[14px] font-light leading-5 text-[#6B6B66] lg:block">
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
									<section
										id={panelId}
										aria-labelledby={buttonId}
										className="max-w-[760px] space-y-3 px-5 pb-5 md:px-6"
									>
										{item.answer.map((paragrafo) => (
											<p
												key={paragrafo}
												className="text-[16px] font-normal leading-[1.5] text-[#2D2D2D]"
											>
												{paragrafo}
											</p>
										))}
									</section>
								)}
							</li>
						);
					})}
				</ul>
			</KvContainer>
		</section>
	);
}
