import { SunMark } from "@/components/brand/sun-mark";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

const VALUES = [
	{
		n: "01",
		title: "Clara",
		body: "Falamos sem jargão. Cada taxa, prazo e cenário explicado de um jeito que você entende.",
	},
	{
		n: "02",
		title: "Acessível",
		body: "Consultoria de gente pra gente. Perto de você, no seu ritmo, sem porta fechada.",
	},
	{
		n: "03",
		title: "Alinhada",
		body: "Trabalhamos alinhados ao seu interesse — miramos o plano certo pro seu momento, não a maior comissão.",
	},
	{
		n: "04",
		title: "Inspiradora",
		body: "Acreditamos no seu sonho e mostramos, na prática, que ele cabe num plano real.",
	},
];

export function Institutional() {
	return (
		<section id="sobre" className="relative overflow-hidden bg-[#f4f1e8] py-20 sm:py-28">
			{/* Motivo do sol gigante sangrando na direita */}
			<div className="pointer-events-none absolute -right-24 top-1/2 hidden -translate-y-1/2 opacity-[0.1] md:block">
				<SunMark variant="color" animated className="size-[640px]" />
			</div>

			<div className="relative mx-auto max-w-[1120px] px-5 sm:px-8">
				<ScrollReveal>
					<span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
						<SunMark variant="blue" className="size-4" />
						Quem somos
					</span>
				</ScrollReveal>

				<div className="mt-12 grid gap-10 md:grid-cols-[0.85fr_1.15fr]">
					<ScrollReveal>
						<p className="text-[clamp(1.5rem,3vw,2.15rem)] font-medium leading-snug text-[#1c2940]">
							Existimos para transformar sonhos em{" "}
							<b className="bg-[var(--gradient-sun)] bg-clip-text font-semibold text-transparent">
								possibilidades reais
							</b>
							.
						</p>
					</ScrollReveal>
					<ScrollReveal delay={0.1} className="space-y-4 text-base leading-relaxed text-[#4a5a6d]">
						<p>
							A Aja Agora nasceu para tornar o consórcio mais simples, transparente e acessível.
							Somos uma consultoria <strong className="font-semibold">independente</strong>:
							comparamos administradoras e desenhamos o caminho mais inteligente para cada pessoa.
						</p>
						<p>
							Acreditamos que conquistar patrimônio não precisa ser confuso. Por isso explicamos
							cada etapa com clareza e cuidamos da vida do seu plano com você — do sonho à
							conquista.
						</p>
						<p>
							A gente viu que nem todo mundo entende as regras de consórcio direito. E resolvemos
							tomar uma atitude.
						</p>
					</ScrollReveal>
				</div>

				<div className="mt-16 grid gap-8 border-t border-[rgba(10,31,51,.1)] pt-12 sm:grid-cols-2 lg:grid-cols-4">
					{VALUES.map((value) => (
						<ScrollReveal key={value.n}>
							<span className="font-mono text-sm text-primary">{value.n}</span>
							<div className="my-3.5 h-[3px] w-[34px] rounded bg-[var(--gradient-sun)]" />
							<h3 className="text-xl font-semibold text-foreground">{value.title}</h3>
							<p className="mt-2 text-sm leading-relaxed text-[#4a5a6d]">{value.body}</p>
						</ScrollReveal>
					))}
				</div>
			</div>
		</section>
	);
}
