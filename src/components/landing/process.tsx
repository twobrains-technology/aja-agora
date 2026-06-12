"use client";

import { Heart, type LucideIcon, MessageCircle, Scale } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

import { SunMark } from "@/components/brand/sun-mark";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

export interface ProcessStep {
	icon: LucideIcon;
	step: string;
	title: string;
	description: string;
}

// Três passos da marca (handoff). As descrições re-ancoram as palavras-chave
// educativas do consórcio (parcela, sem juros, lance, assembleia, contemplação)
// que antes viviam no stepper de 5 passos.
export const PROCESS_STEPS: ProcessStep[] = [
	{
		icon: MessageCircle,
		step: "1",
		title: "Você conta o sonho",
		description:
			"Diga o que quer conquistar e quanto cabe no mês. Montamos a parcela ideal — sem juros e sem julgamento, no seu ritmo.",
	},
	{
		icon: Scale,
		step: "2",
		title: "Nós comparamos",
		description:
			"Buscamos entre as administradoras o plano mais inteligente pro seu perfil, comparando taxa, prazo e histórico de cada grupo.",
	},
	{
		icon: Heart,
		step: "3",
		title: "Seguimos juntos",
		description:
			"Explicamos cada assembleia e o melhor momento de dar um lance, e acompanhamos seu plano até a contemplação. Sempre por perto.",
	},
];

export function Process() {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, amount: 0.4 });

	return (
		<section id="como" className="bg-[#fbfbf9] py-16 sm:py-24">
			<div className="mx-auto max-w-[1120px] px-5 sm:px-8">
				<ScrollReveal className="mx-auto mb-14 max-w-2xl text-center">
					<span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
						<SunMark variant="blue" className="size-4" />
						Como trabalhamos
					</span>
					<h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl">
						Três passos. Nenhum formulário interminável.
					</h2>
				</ScrollReveal>

				<div ref={ref} className="relative grid gap-10 sm:grid-cols-3">
					{/* Conector pontilhado que se desenha */}
					<svg
						className="pointer-events-none absolute left-0 right-0 top-[35px] hidden sm:block"
						height="2"
						preserveAspectRatio="none"
						viewBox="0 0 100 2"
						aria-hidden="true"
					>
						<motion.path
							d="M0,1 L100,1"
							stroke="var(--primary)"
							strokeWidth="0.4"
							strokeDasharray="2 2"
							strokeOpacity="0.3"
							initial={{ pathLength: 0 }}
							animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
							transition={{ duration: 0.9, ease: "easeInOut" }}
						/>
					</svg>

					{PROCESS_STEPS.map((step, i) => (
						<motion.div
							key={step.step}
							className="relative text-center"
							initial={{ opacity: 0, y: 24 }}
							animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
							transition={{ duration: 0.5, delay: i * 0.15, ease: [0.21, 0.47, 0.32, 0.98] }}
						>
							<div className="relative mx-auto mb-5 flex size-[70px] items-center justify-center rounded-[20px] border border-border bg-card text-primary shadow-md">
								<step.icon className="size-7" strokeWidth={1.8} />
								<span className="absolute -right-2 -top-2 flex size-[26px] items-center justify-center rounded-full bg-[var(--surface-ink)] text-xs font-semibold text-white">
									{step.step}
								</span>
							</div>
							<h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
							<p className="mx-auto mt-1.5 max-w-[27ch] text-sm leading-relaxed text-muted-foreground">
								{step.description}
							</p>
						</motion.div>
					))}
				</div>
			</div>
		</section>
	);
}
