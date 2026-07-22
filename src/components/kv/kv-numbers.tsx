import { Building2, DollarSign, TrendingUp, Users } from "lucide-react";

import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

type Metric = {
	icon: typeof DollarSign;
	value: string;
	highlight: string;
	label: string;
};

const metrics: Metric[] = [
	{
		icon: DollarSign,
		value: "R$ 351 bi",
		highlight: "bilhões",
		label: "Créditos comercializados em todo o Brasil em 2024",
	},
	{
		icon: Users,
		value: "10,7 mi",
		highlight: "milhões",
		label: "Participantes ativos investindo no sistema de consórcio",
	},
	{
		icon: TrendingUp,
		value: "32%",
		highlight: "Crescimento",
		label: "Aumento real do setor em relação ao ano anterior",
	},
	{
		icon: Building2,
		value: "+2.000",
		highlight: "Grupos",
		label: "Grupos de consórcio saudáveis em andamento",
	},
];

// Ticker do marquee quebrado em tokens pra permitir trechos-chave em negrito
// (padrão do Figma: números/frases-chave em Poppins bold, resto em regular).
const MARQUEE_SEGMENTS: { id: string; text: string; bold?: boolean }[] = [
	{ id: "house", text: "🏡 " },
	{ id: "12,7-milhoes", text: "12,7 milhões", bold: true },
	{ id: "de-consorciados", text: " de consorciados  ✦  " },
	{ id: "car", text: "🚗 " },
	{ id: "1-em-cada-3", text: "1 em cada 3", bold: true },
	{ id: "veiculos-via-consorcio", text: " veículos via consórcio  ✦  " },
	{ id: "money", text: "💰 " },
	{ id: "r$-500-bi", text: "R$ 500 bi", bold: true },
	{ id: "movimentados", text: " movimentados  ✦  " },
	{ id: "chart", text: "📈 " },
	{ id: "recorde-em-2025", text: "Recorde em 2025", bold: true },
	{ id: "separador-1", text: "  ✦  " },
	{ id: "target", text: "🎯 " },
	{ id: "5-milhoes", text: "5 milhões", bold: true },
	{ id: "de-cotas-vendidas", text: " de cotas vendidas  ✦  " },
	{ id: "trophy", text: "🏆 " },
	{ id: "760-mil", text: "760 mil", bold: true },
	{ id: "contemplacoes", text: " contemplações  ✦  " },
];

const MARQUEE_TEXT = MARQUEE_SEGMENTS.map((segment) => segment.text).join("");

// Seção "Big Numbers" (Figma: Group 123 → big-numbers-consorcio + Marquee Ticker).
// Bloco navy full-bleed com blobs desfocados, header centralizado e 4 cards de
// métrica; abaixo, uma faixa coral com texto rolando em loop contínuo (CSS puro).
export function KvNumbers() {
	return (
		<>
			<section className="relative overflow-hidden bg-[#021628]">
				{/* Blobs decorativos desfocados */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -left-[150px] top-[100px] size-[400px] rounded-full bg-[#FFE0E3] opacity-20 blur-[100px]"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -right-[160px] -top-[100px] size-[450px] rounded-full bg-[#0C3357] opacity-30 blur-[100px]"
				/>

				<KvContainer className="max-w-[1240px] py-6 md:px-6 md:py-8 lg:px-0">
					{/* Header */}
					<div className="mx-auto flex flex-col items-center gap-4 text-center">
						<KvEyebrow className="mx-auto max-w-[762px] tracking-[0.15em]">
							O SETOR EM NÚMEROS
						</KvEyebrow>
						<h2 className="text-[32px] font-normal leading-[1.2] text-[#FAFAF3] md:text-[40px] md:leading-[48px]">
							O setor de <Em>consórcio não para</Em> de crescer
						</h2>
						<p className="mx-auto max-w-[762px] text-[16px] leading-[24px] text-white">
							Investir em consórcio é a escolha inteligente de milhões de brasileiros para construir
							patrimônio com segurança, planejamento e sem juros abusivos.
						</p>
					</div>

					{/* Cards de métrica */}
					<div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
						{metrics.map((metric) => (
							<div
								key={metric.label}
								className="flex flex-col items-center gap-4 rounded-[16px] bg-[#0C3357] p-6 text-center"
							>
								<span className="h-1 w-10 shrink-0 rounded-full bg-[#F2404F]" />

								<div className="flex flex-col items-center gap-3">
									<metric.icon className="size-8 text-[#F2404F]" strokeWidth={2} />
									<div className="flex flex-col items-center gap-1">
										<span className="text-[40px] font-bold leading-[54px] text-[#FAFAF3] md:text-[48px]">
											{metric.value}
										</span>
										<span className="text-[13px] font-semibold uppercase leading-[100%] tracking-wide text-[#FFE0E3]">
											{metric.highlight}
										</span>
									</div>
								</div>

								<span className="h-px w-full bg-white/10" />

								<p className="max-w-[244px] text-[14px] leading-[20px] text-[#FAFAF3]/70">
									{metric.label}
								</p>
							</div>
						))}
					</div>
				</KvContainer>
			</section>

			{/* Marquee Ticker */}
			<div className="overflow-hidden bg-[#F2404F] py-5" role="marquee" aria-label={MARQUEE_TEXT}>
				<style>{`
					@keyframes kv-numbers-marquee {
						to { transform: translateX(-50%); }
					}
					.kv-numbers-marquee-track {
						animation: kv-numbers-marquee 32s linear infinite;
					}
					@media (prefers-reduced-motion: reduce) {
						.kv-numbers-marquee-track {
							animation: none;
						}
					}
				`}</style>
				<div className="kv-numbers-marquee-track flex w-max items-center" aria-hidden="true">
					{[0, 1].map((copy) => (
						<span
							key={copy}
							className="shrink-0 whitespace-nowrap text-[18px] font-normal text-white"
						>
							{MARQUEE_SEGMENTS.map((segment) => (
								<span
									key={`${copy}-${segment.id}`}
									className={segment.bold ? "font-semibold" : "font-normal"}
								>
									{segment.text}
								</span>
							))}
						</span>
					))}
				</div>
			</div>
		</>
	);
}
