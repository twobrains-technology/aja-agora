"use client";

import { useId, useState } from "react";

import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

const FAQ_ITEMS = [
	{
		question: "Consórcio é seguro?",
		summary: "Regulamentado e fiscalizado pelo Banco Central desde 2008.",
		answer:
			"Sim. O consórcio é regulamentado pela Lei 11.795/2008 e fiscalizado pelo Banco Central do Brasil, que autoriza e supervisiona as administradoras — uma fiscalização semelhante à de bancos.",
	},
	{
		question: "Quanto tempo demora para ser contemplado?",
		summary: "Depende do grupo e da estratégia — sorteio mensal ou lance antecipam.",
		answer:
			"Varia conforme o grupo, o valor do crédito e a estratégia usada. Todo mês há sorteio entre os participantes, e quem oferece lance aumenta as chances de ser contemplado antes do fim do prazo do plano.",
	},
	{
		question: "Posso usar FGTS no consórcio?",
		summary: "Sim, em consórcio de imóvel — para lance ou amortização.",
		answer:
			"Sim, para consórcio de imóvel residencial: o FGTS pode ser usado tanto para dar lance quanto para amortizar ou quitar o saldo devedor após a contemplação, seguindo as regras da Caixa Econômica Federal. Para consórcio de veículo, o FGTS não pode ser usado.",
	},
	{
		question: "Atrasei uma parcela do consórcio. E agora?",
		summary: "Gera multa e juros, mas dá pra negociar com a administradora.",
		answer:
			"O atraso gera multa e juros conforme o contrato, mas não cancela sua participação automaticamente — é possível negociar diretamente com a administradora. Atrasos recorrentes podem levar à exclusão do grupo, com devolução dos valores pagos conforme as regras contratuais e da assembleia.",
	},
	{
		question: "Posso vender minha carta de crédito?",
		summary: "A cota pode ser transferida a outra pessoa, com aprovação da administradora.",
		answer:
			"A carta de crédito em si não é vendida — ela representa o direito de uso vinculado ao seu CPF. O que é possível é transferir a cota (sua posição no grupo) para outra pessoa, mediante aprovação da administradora e assinatura de um termo de transferência.",
	},
] as const;

// Perguntas Frequentes (Figma frame 'Perguntas Frequentes' 1437x815): bloco
// cream full-bleed com eyebrow + título à esquerda e accordion de 5 perguntas.
export function KvFaq() {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const baseId = useId();

	return (
		<section className="relative overflow-hidden bg-[#F2F2DB] py-6 md:py-8">
			{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
			<img
				aria-hidden="true"
				src="/kv/faq-chevron-pattern.svg"
				alt=""
				className="pointer-events-none absolute inset-y-0 right-0 hidden w-[40%] max-w-[566px] md:block"
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
										<span className="text-[20px] font-normal leading-[1.2] text-[#052440] lg:shrink-0 lg:text-[32px] lg:leading-[38px]">
											{item.question}
										</span>
										<span className="hidden max-w-[400px] text-[14px] font-light leading-5 text-[#6B6B66] lg:block">
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
			</KvContainer>
		</section>
	);
}
