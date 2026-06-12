"use client";

import { ArrowRight } from "lucide-react";

import { SunMark } from "@/components/brand/sun-mark";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

interface ClosingProps {
	onStart: () => void;
}

export function Closing({ onStart }: ClosingProps) {
	return (
		<section id="fale" className="bg-[#fbfbf9] px-5 py-16 sm:px-8 sm:py-24">
			<div className="mx-auto max-w-[1120px]">
				<ScrollReveal>
					<div className="relative isolate overflow-hidden rounded-[28px] bg-[var(--surface-ink)] px-6 py-20 text-center sm:px-10">
						{/* Halo radial azul emergindo de baixo */}
						<div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[radial-gradient(ellipse_at_bottom,rgba(3,110,255,.32),transparent_70%)]" />

						<div className="mx-auto mb-6 flex size-[72px] items-center justify-center">
							<SunMark variant="white" animated className="size-[72px]" />
						</div>
						<h2 className="mx-auto max-w-[18ch] text-[clamp(2rem,4.4vw,3rem)] font-semibold leading-tight text-white">
							Comece a conversa que resolve seu consórcio.
						</h2>
						<p className="mx-auto mt-4 max-w-[44ch] text-[#a8bdd4]">
							Leva alguns minutos. E pode ser o melhor passo que você dá pelo seu patrimônio este
							ano.
						</p>
						<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
							<button
								type="button"
								onClick={onStart}
								className="inline-flex items-center gap-2 rounded-[13px] bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-primary transition-[filter] hover:brightness-105 active:translate-y-px"
							>
								Falar com a gente
								<ArrowRight className="size-4" strokeWidth={1.8} />
							</button>
							<a
								href="#como"
								className="inline-flex items-center gap-2 rounded-[13px] border border-white/25 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white/40 hover:bg-white/10"
							>
								Ver como funciona
							</a>
						</div>
					</div>
				</ScrollReveal>
			</div>
		</section>
	);
}
