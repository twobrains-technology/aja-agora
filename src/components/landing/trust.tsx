import { Eye, Heart, type LucideIcon, Scale } from "lucide-react";

import { ScrollReveal } from "@/components/landing/scroll-reveal";

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
	{
		icon: Scale,
		title: "Independentes",
		body: "Não trabalhamos para uma administradora só. Comparamos o mercado inteiro pra você.",
	},
	{
		icon: Eye,
		title: "Transparentes",
		body: "Cada etapa, taxa e cenário explicado em português claro. Sem letra miúda.",
	},
	{
		icon: Heart,
		title: "Do seu lado",
		body: "Acompanhamos a vida do seu plano — do primeiro “oi” até a conquista.",
	},
];

export function Trust() {
	return (
		<section className="bg-[#fbfbf9] py-12">
			<div className="mx-auto max-w-[1120px] px-5 sm:px-8">
				<ScrollReveal>
					<div className="grid gap-px overflow-hidden rounded-[18px] border border-border bg-border sm:grid-cols-3">
						{PILLARS.map((pillar) => (
							<div key={pillar.title} className="bg-[#fbfbf9] p-7">
								<div className="mb-4 flex size-9 items-center justify-center rounded-[10px] border border-border bg-card text-primary">
									<pillar.icon className="size-5" strokeWidth={1.8} />
								</div>
								<h4 className="text-base font-semibold text-foreground">{pillar.title}</h4>
								<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
									{pillar.body}
								</p>
							</div>
						))}
					</div>
				</ScrollReveal>
			</div>
		</section>
	);
}
