"use client";

import { ArrowRight } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

import { SunMark } from "@/components/brand/sun-mark";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

const BUBBLES = [
	{ from: "agent" as const, text: "Oi! O que você quer conquistar?" },
	{
		from: "user" as const,
		text: "Um carro de uns R$ 80 mil, gastando perto de R$ 850 por mês.",
	},
	{
		from: "agent" as const,
		text: "Perfeito. Comparei 3 administradoras e achei o plano com melhor histórico de contemplação 👇",
	},
];

const REC_GRID = [
	{ k: "Valor do bem", v: "R$ 80.000" },
	{ k: "Prazo", v: "80 meses" },
	{ k: "Taxa adm.", v: "16,0%" },
	{ k: "Contemplados/mês", v: "4" },
];

export function Demo() {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, amount: 0.3 });

	return (
		<section id="pratica" className="bg-[#fbfbf9] py-16 sm:py-24">
			<div className="mx-auto max-w-[1120px] px-5 sm:px-8">
				<ScrollReveal className="mx-auto mb-12 max-w-2xl text-center">
					<span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
						<SunMark variant="blue" className="size-4" />
						Na prática
					</span>
					<h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl">
						Você conversa. Nós fazemos o trabalho pesado.
					</h2>
					<p className="mt-3 text-muted-foreground">
						Nada de planilhas ou vendedor insistente. Entendemos seu momento e entregamos a
						recomendação pronta.
					</p>
				</ScrollReveal>

				<div ref={ref} className="grid gap-5 lg:grid-cols-2">
					{/* Painel — Conversa */}
					<div className="rounded-[20px] border border-border bg-card p-6 shadow-xs">
						<div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
							<span className="size-1.5 rounded-full bg-[#28c081]" />
							Conversa
						</div>
						<div className="flex flex-col gap-3">
							{BUBBLES.map((bubble, i) => (
								<motion.div
									key={bubble.text}
									className={bubble.from === "user" ? "flex justify-end" : "flex items-end gap-2"}
									initial={{ opacity: 0, y: 10 }}
									animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
									transition={{ duration: 0.46, delay: i * 0.42, ease: [0.21, 0.47, 0.32, 0.98] }}
								>
									{bubble.from === "agent" && (
										<span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-ink)] p-1.5">
											<SunMark variant="white" className="size-full" />
										</span>
									)}
									<div
										className={
											bubble.from === "user"
												? "max-w-[85%] rounded-2xl rounded-tr-[5px] bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground"
												: "max-w-[85%] rounded-2xl rounded-tl-[5px] bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-foreground"
										}
									>
										{bubble.text}
									</div>
								</motion.div>
							))}
						</div>
					</div>

					{/* Painel — Recomendação (artefato de marketing) */}
					<div className="rounded-[20px] border border-border bg-card p-6 shadow-xs">
						<div className="flex items-center justify-between gap-2">
							<span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
								<SunMark variant="color" className="size-[18px]" />
								Recomendação
							</span>
							<span className="text-xs text-[#9aa7b6]">Consórcio Bevi · Grupo 1042</span>
						</div>

						<div className="mt-5">
							<p className="text-xs text-muted-foreground">Parcela mensal</p>
							<p className="aja-num mt-1 text-4xl font-semibold text-foreground">
								R$ 842
								<span className="text-lg font-medium text-muted-foreground">,50/mês</span>
							</p>
						</div>

						<div className="my-5 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border py-5">
							{REC_GRID.map((cell) => (
								<div key={cell.k}>
									<p className="text-xs text-muted-foreground">{cell.k}</p>
									<p className="aja-num mt-0.5 text-sm font-semibold text-foreground">{cell.v}</p>
								</div>
							))}
						</div>

						<button
							type="button"
							className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-primary py-3 text-sm font-medium text-primary-foreground shadow-primary transition-[filter] hover:brightness-105 active:translate-y-px"
						>
							Tenho interesse
							<ArrowRight className="size-4" strokeWidth={1.8} />
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
