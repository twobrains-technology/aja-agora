"use client";

import { Bot, Eye, MonitorSmartphone, ShieldCheck, Smartphone, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MotionPreset } from "@/components/ui/motion-preset";

const benefits = [
	{
		icon: Smartphone,
		title: "100% digital",
		description: "Sem papel, sem agencia, sem filas.",
	},
	{
		icon: Zap,
		title: "Analise em segundos",
		description: "A IA compara planos instantaneamente.",
	},
	{
		icon: Bot,
		title: "Sem corretor",
		description: "Voce conversa direto com a IA.",
	},
	{
		icon: Eye,
		title: "Transparencia total",
		description: "Taxas, custos e simulacoes claras.",
	},
	{
		icon: MonitorSmartphone,
		title: "Mobile-first",
		description: "Funciona perfeitamente no celular.",
	},
	{
		icon: ShieldCheck,
		title: "Dados protegidos",
		description: "Suas informações estão seguras.",
	},
];

export function BenefitsSection() {
	return (
		<section id="beneficios" className="py-12 sm:py-20 lg:py-28">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				{/* Section Header */}
				<MotionPreset fade blur="4px" slide={{ direction: "up", offset: 16 }}>
					<div className="mb-12 space-y-4 sm:mb-16">
						<Badge variant="outline">Beneficios</Badge>
						<h2 className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
							Por que usar o Aja Agora?
						</h2>
						<p className="text-muted-foreground text-lg max-w-lg">
							A forma mais inteligente de encontrar seu consorcio.
						</p>
					</div>
				</MotionPreset>

				{/* Cards Grid */}
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{benefits.map((benefit, index) => (
						<MotionPreset
							key={index}
							fade
							blur="4px"
							slide={{ direction: "up", offset: 24 }}
							delay={index * 0.08}
						>
							<Card className="h-full shadow-none transition-colors duration-300 hover:border-foreground/20">
								<CardContent className="flex flex-col gap-4">
									<div className="flex size-11 items-center justify-center rounded-xl bg-foreground text-background">
										<benefit.icon className="size-5" strokeWidth={1.5} />
									</div>
									<div>
										<h3 className="mb-1.5 text-lg font-semibold">{benefit.title}</h3>
										<p className="text-muted-foreground text-sm leading-relaxed">
											{benefit.description}
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
