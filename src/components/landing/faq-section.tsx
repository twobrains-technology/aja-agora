"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { MotionPreset } from "@/components/ui/motion-preset";

const faqItems = [
	{
		question: "O que é consórcio?",
		answer:
			"Consórcio é uma modalidade de compra programada onde um grupo de pessoas contribui mensalmente para formar uma poupança coletiva.",
	},
	{
		question: "Como funciona a IA?",
		answer:
			"Nosso consultor de IA analisa centenas de grupos disponíveis e encontra o melhor plano baseado no seu perfil, orçamento e prazo.",
	},
	{
		question: "Preciso pagar algo para usar?",
		answer:
			"Não! A consulta com nosso consultor de IA é totalmente gratuita. Você só paga quando decidir assinar um consórcio.",
	},
	{
		question: "É seguro?",
		answer:
			"Sim. Seus dados são protegidos e nunca compartilhados. O consórcio é regulado pelo Banco Central do Brasil.",
	},
];

export function FaqSection() {
	return (
		<section id="faq" className="py-12 sm:py-20 lg:py-28">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
					{/* Left Column -- Header */}
					<MotionPreset fade blur="4px" slide={{ direction: "up", offset: 16 }}>
						<div className="space-y-4 lg:sticky lg:top-24">
							<Badge variant="outline">FAQ</Badge>
							<h2 className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
								Perguntas frequentes
							</h2>
							<p className="text-muted-foreground text-lg max-w-md">
								Tudo o que voce precisa saber sobre consorcio e o Aja Agora.
							</p>
						</div>
					</MotionPreset>

					{/* Right Column -- Accordion */}
					<MotionPreset fade blur="4px" slide={{ direction: "up", offset: 24 }} delay={0.1}>
						<Accordion className="w-full" defaultValue={["item-1"]}>
							{faqItems.map((item, index) => (
								<AccordionItem key={index} value={`item-${index + 1}`}>
									<AccordionTrigger className="text-left text-base font-medium sm:text-lg">
										{item.question}
									</AccordionTrigger>
									<AccordionContent className="text-muted-foreground leading-relaxed">
										{item.answer}
									</AccordionContent>
								</AccordionItem>
							))}
						</Accordion>
					</MotionPreset>
				</div>
			</div>
		</section>
	);
}
