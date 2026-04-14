import { MessageSquare, BrainCircuit, FileCheck } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { MotionPreset } from "@/components/ui/motion-preset";

const steps = [
	{
		icon: MessageSquare,
		step: "01",
		title: "Diga o que quer",
		description:
			"Conte seu sonho: um carro, imovel ou servico. Nosso consultor de IA entende suas necessidades em segundos.",
	},
	{
		icon: BrainCircuit,
		step: "02",
		title: "Receba recomendacoes",
		description:
			"A IA analisa centenas de grupos e encontra o melhor plano para seu bolso e prazo — automaticamente.",
	},
	{
		icon: FileCheck,
		step: "03",
		title: "Escolha e assine",
		description:
			"Compare opcoes, simule parcelas e feche seu consorcio. Tudo dentro do chat, sem burocracia.",
	},
];

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
						Como funciona
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
						Tres passos para o seu consorcio ideal
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
						Converse com a IA, receba recomendacoes personalizadas e feche seu consorcio — sem formularios, sem corretores.
					</MotionPreset>
				</div>

				{/* Steps Grid */}
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{steps.map((step, index) => (
						<MotionPreset
							key={step.step}
							fade
							slide={{ direction: "up", offset: 40 }}
							blur
							delay={0.5 + index * 0.15}
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
