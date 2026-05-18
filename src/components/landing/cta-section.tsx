"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { MotionPreset } from "@/components/ui/motion-preset";

export function CtaSection() {
	return (
		<section className="py-12 sm:py-20 lg:py-28">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<MotionPreset fade blur="4px" slide={{ direction: "up", offset: 24 }}>
					<div className="rounded-3xl bg-foreground px-8 py-16 text-center sm:px-16 sm:py-20 lg:px-24 lg:py-24">
						<div className="mx-auto flex max-w-lg flex-col items-center gap-6">
							<h2 className="text-2xl font-bold tracking-tight text-background sm:text-3xl lg:text-4xl">
								Pronto para realizar seu sonho?
							</h2>
							<p className="text-background/70 text-base sm:text-lg">
								Converse agora com nosso consultor de IA e descubra o consorcio ideal para voce.
							</p>
							<Button
								size="lg"
								className="mt-2 gap-2 bg-background text-foreground hover:bg-background/90"
								render={<Link href="/chat" />}
								nativeButton={false}
							>
								Comecar agora
								<ArrowRight className="size-4" />
							</Button>
						</div>
					</div>
				</MotionPreset>
			</div>
		</section>
	);
}
