"use client";

import { useEffect, useState } from "react";
import type { JSX } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { MessageSquare, BrainCircuit, FileCheck, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MotionPreset } from "@/components/ui/motion-preset";

type Process = {
	id: string;
	icon: JSX.Element;
	step: string;
	title: string;
	description: string;
};

const processes: Process[] = [
	{
		id: "1",
		step: "01",
		icon: <MessageSquare />,
		title: "Diga o que quer",
		description:
			"Conte seu sonho: um carro, imovel ou servico. Nosso consultor de IA entende suas necessidades em segundos.",
	},
	{
		id: "2",
		step: "02",
		icon: <BrainCircuit />,
		title: "Receba recomendacoes",
		description:
			"A IA analisa centenas de grupos e encontra o melhor plano para seu bolso e prazo — automaticamente.",
	},
	{
		id: "3",
		step: "03",
		icon: <FileCheck />,
		title: "Escolha e assine",
		description:
			"Compare opcoes, simule parcelas e feche seu consorcio. Tudo dentro do chat, sem burocracia.",
	},
];

function ProcessFlow({ initialProcess }: { initialProcess: Process[] }) {
	const [processStage, setProcessStage] = useState<Process[]>(initialProcess);

	useEffect(() => {
		const interval = setInterval(() => {
			setProcessStage((prev) => {
				const newArray = [...prev];
				newArray.push(newArray.shift()!);
				return newArray;
			});
		}, 3000);

		return () => clearInterval(interval);
	}, []);

	return (
		<div className="relative mx-auto flex h-56 w-full sm:h-64">
			{processStage.map((item, index) => (
				<motion.div
					key={item.id}
					className="absolute inset-x-0 h-44 sm:h-48"
					style={{ transformOrigin: "top center" }}
					animate={{
						bottom: index * 18,
						scale: 1 - index * 0.08,
						zIndex: processStage.length - index,
						opacity: 1 - index * 0.25,
					}}
					transition={{
						duration: 0.5,
						ease: "easeInOut",
						delay: index * 0.05,
					}}
				>
					<Card className="h-full border shadow-lg">
						<CardContent className="flex h-full flex-col justify-between gap-4 p-6">
							<div className="flex items-center gap-4">
								<div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-foreground text-background [&>svg]:size-6 [&>svg]:stroke-[1.5]">
									{item.icon}
								</div>
								<span className="text-muted-foreground text-sm font-medium tracking-widest">
									PASSO {item.step}
								</span>
							</div>
							<div className="space-y-2">
								<h3 className="text-2xl font-semibold tracking-tight">{item.title}</h3>
								<p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
							</div>
						</CardContent>
					</Card>
				</motion.div>
			))}
		</div>
	);
}

export function HowItWorks() {
	return (
		<section id="como-funciona" className="py-12 sm:py-20 lg:py-28">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 gap-12 lg:grid-cols-2 xl:gap-20 items-center">
					{/* Left content */}
					<div className="space-y-5">
						<MotionPreset fade blur slide={{ direction: "down", offset: 40 }} transition={{ duration: 0.5 }}>
							<Badge variant="outline" className="text-sm font-normal">
								Como funciona
							</Badge>
						</MotionPreset>

						<MotionPreset
							component="h2"
							className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl"
							fade
							blur
							slide={{ direction: "down", offset: 40 }}
							delay={0.15}
							transition={{ duration: 0.5 }}
						>
							Tres passos para o seu consorcio ideal
						</MotionPreset>

						<MotionPreset
							component="p"
							className="text-muted-foreground text-lg max-w-md"
							fade
							blur
							slide={{ direction: "down", offset: 40 }}
							delay={0.3}
							transition={{ duration: 0.5 }}
						>
							Converse com a IA, receba recomendacoes personalizadas e feche seu consorcio — sem formularios, sem corretores.
						</MotionPreset>

						<MotionPreset
							className="flex flex-wrap items-center gap-3 pt-2"
							fade
							blur
							slide={{ direction: "down", offset: 40 }}
							transition={{ duration: 0.5 }}
							delay={0.45}
						>
							<Button size="lg" className="gap-2" render={<Link href="/chat" />} nativeButton={false}>
								Comecar agora
								<ArrowRight className="size-4" />
							</Button>
							<Button size="lg" variant="outline" render={<a href="#faq" />} nativeButton={false}>
								Tire suas duvidas
							</Button>
						</MotionPreset>
					</div>

					{/* Right content — animated process stack */}
					<MotionPreset fade blur transition={{ duration: 0.7 }} className="h-64 sm:h-72">
						<ProcessFlow initialProcess={processes} />
					</MotionPreset>
				</div>
			</div>
		</section>
	);
}
