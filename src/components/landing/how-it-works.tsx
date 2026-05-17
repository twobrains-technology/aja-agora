import {
	type LucideIcon,
	ClipboardList,
	Calculator,
	Users,
	Trophy,
	Sparkles,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { MotionPreset } from "@/components/ui/motion-preset";

export interface Step {
	icon: LucideIcon;
	step: string;
	title: string;
	description: string;
}

// 5 passos focados em benefícios do consórcio (bug #19 — Bruna v1 review).
export const STEPS: Step[] = [
	{
		icon: ClipboardList,
		step: "01",
		title: "Escolha o plano",
		description:
			"Diga o que você quer realizar — imóvel, carro ou moto — e encontramos grupos com a parcela que cabe no seu mês.",
	},
	{
		icon: Calculator,
		step: "02",
		title: "Faça sua simulação",
		description:
			"Compare administradoras lado a lado: parcela, taxa de administração, fundo de reserva e prazo. Sem juros, só os custos do grupo.",
	},
	{
		icon: Users,
		step: "03",
		title: "Entre no grupo",
		description:
			"Você começa a contribuir mensalmente junto com outras pessoas que querem o mesmo. Sua parcela é menor que financiamento porque não tem juros.",
	},
	{
		icon: Trophy,
		step: "04",
		title: "Seja contemplado",
		description:
			"A cada assembleia mensal, integrantes do grupo são contemplados — por sorteio ou por lance. Lance acelera a contemplação.",
	},
	{
		icon: Sparkles,
		step: "05",
		title: "Realize seu objetivo",
		description:
			"Com a carta de crédito em mãos, você compra o bem na hora — direto da concessionária, construtora ou vendedor que escolher.",
	},
];

export const HOW_IT_WORKS_COPY = {
	eyebrow: "Como funciona",
	subtitle: "Cinco passos para realizar seu sonho com consórcio",
	description:
		"Consórcio é grupo de pessoas que se unem para comprar um bem em comum. Sem juros, parcela menor que financiamento — você é contemplado por sorteio ou lance ao longo do prazo.",
};

export function HowItWorks() {
	return (
		<section id="como-funciona" className="py-12 sm:py-20 lg:py-28">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				{/* Centered Header */}
				<div className="mb-12 space-y-4 text-center sm:mb-16 lg:mb-20">
					<MotionPreset
						className="text-primary text-sm font-medium uppercase tracking-wider"
						fade
						slide={{ direction: "down", offset: 30 }}
						blur
						transition={{ duration: 0.5 }}
					>
						{HOW_IT_WORKS_COPY.eyebrow}
					</MotionPreset>

					<MotionPreset
						component="h2"
						className="text-3xl font-bold tracking-tight md:text-4xl"
						fade
						slide={{ direction: "down", offset: 50 }}
						blur
						delay={0.2}
						transition={{ duration: 0.6 }}
					>
						{HOW_IT_WORKS_COPY.subtitle}
					</MotionPreset>

					<MotionPreset
						component="p"
						className="text-muted-foreground mx-auto max-w-2xl text-lg"
						fade
						blur
						slide={{ direction: "down", offset: 50 }}
						delay={0.3}
						transition={{ duration: 0.5 }}
					>
						{HOW_IT_WORKS_COPY.description}
					</MotionPreset>
				</div>

				{/* Steps Grid — stepper visual 5 passos (bug #19) */}
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
					{STEPS.map((step, index) => (
						<MotionPreset
							key={step.step}
							fade
							slide={{ direction: "up", offset: 40 }}
							blur
							delay={0.5 + index * 0.12}
							transition={{ duration: 0.5 }}
						>
							<Card className="hover:border-primary h-full border shadow-none transition-colors duration-300">
								<CardContent className="flex gap-4">
									<Avatar className="size-10 shrink-0 rounded-lg">
										<AvatarFallback className="bg-foreground text-background rounded-lg [&>svg]:size-5">
											<step.icon />
										</AvatarFallback>
									</Avatar>
									<div>
										<span className="text-muted-foreground text-xs font-medium tracking-widest">
											PASSO {step.step}
										</span>
										<h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
										<p className="text-muted-foreground mt-1 leading-relaxed text-sm">
											{step.description}
										</p>
									</div>
								</CardContent>
							</Card>
						</MotionPreset>
					))}
				</div>
			</div>
		</section>
	);
}
