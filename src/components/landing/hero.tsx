"use client";

import { Bike, Car, Home, Send } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { SunMark } from "@/components/brand/sun-mark";
import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

const TYPEWRITER_PHRASES = [
	"Quero um carro de até R$ 80 mil…",
	"Um apê de R$ 320 mil, em 10 anos.",
	"Trocar de moto gastando R$ 400/mês.",
	"Juntar pra reforma sem pagar juros.",
];

const CHIPS = [
	{ icon: Home, label: "Imóvel", fill: "Quero comprar um imóvel." },
	{ icon: Car, label: "Carro", fill: "Quero trocar de carro." },
	{ icon: Bike, label: "Moto", fill: "Quero uma moto nova." },
];

interface HeroProps {
	onOpenChat: TheaterOpener;
}

export function Hero({ onOpenChat }: HeroProps) {
	const [value, setValue] = useState("");
	const [placeholder, setPlaceholder] = useState("");
	const [typingDone, setTypingDone] = useState(false);
	const reduceMotion = useReducedMotion();
	const inputRef = useRef<HTMLInputElement>(null);
	const formRef = useRef<HTMLFormElement>(null);

	// Typewriter — cicla as frases enquanto o input está vazio.
	useEffect(() => {
		if (reduceMotion) {
			setPlaceholder(TYPEWRITER_PHRASES[0]);
			return;
		}
		if (value) return;

		let phrase = 0;
		let char = 0;
		let deleting = false;
		let timer: ReturnType<typeof setTimeout>;

		const tick = () => {
			const full = TYPEWRITER_PHRASES[phrase];
			setPlaceholder(full.slice(0, char));
			if (!deleting && char < full.length) {
				char++;
				timer = setTimeout(tick, 46);
			} else if (!deleting && char === full.length) {
				deleting = true;
				timer = setTimeout(tick, 1700);
			} else if (deleting && char > 0) {
				char--;
				timer = setTimeout(tick, 24);
			} else {
				deleting = false;
				phrase = (phrase + 1) % TYPEWRITER_PHRASES.length;
				timer = setTimeout(tick, 260);
			}
		};
		tick();
		return () => clearTimeout(timer);
	}, [value, reduceMotion]);

	// Enviar / Enter → abre o teatro morfando do composer. Texto digitado vira a
	// 1ª mensagem; vazio abre na saudação do agente.
	const submit = (e?: FormEvent) => {
		e?.preventDefault();
		onOpenChat(value.trim(), formRef.current);
	};

	return (
		<header className="relative min-h-[610px] overflow-hidden bg-[#fbfbf9]">
			{/* Foto — centro-direita, fade horizontal pro off-white */}
			<div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[64%] md:block">
				<Image
					src="/brand/hero-scene.png"
					alt="Consultora da Aja Agora conversando com um cliente"
					fill
					priority
					sizes="64vw"
					className="object-cover object-[50%_center] [mask-image:linear-gradient(to_right,transparent_0%,#000_20%)]"
				/>
			</div>
			{/* Frost band na zona de sobreposição texto↔imagem */}
			<div className="pointer-events-none absolute inset-y-0 right-[36%] hidden w-[16%] backdrop-blur-[6px] [mask-image:linear-gradient(to_right,transparent,#000_40%,#000_60%,transparent)] md:block" />
			{/* Orbs decorativos */}
			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				<div className="absolute -left-20 top-10 size-[460px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(3,110,255,.10),transparent_70%)] blur-2xl" />
				<div className="absolute right-1/3 top-1/3 size-[380px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(3,178,217,.10),transparent_70%)] blur-2xl" />
			</div>

			{/* Foto mobile — bloco no topo */}
			<div className="relative h-[280px] w-full md:hidden">
				<Image
					src="/brand/hero-scene.png"
					alt="Consultora da Aja Agora conversando com um cliente"
					fill
					priority
					sizes="100vw"
					className="object-cover object-[50%_center] [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
				/>
			</div>

			<div className="relative mx-auto max-w-[1280px] px-5 py-12 sm:px-8 md:py-24">
				<div className="max-w-[560px] md:max-w-[44%]">
					{/* Chip */}
					<motion.span
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4 }}
						className="inline-flex h-[34px] items-center gap-2 rounded-full border border-border bg-white/70 py-0 pl-[7px] pr-4 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur-sm"
					>
						<span className="flex size-[22px] items-center justify-center rounded-full bg-[var(--surface-ink)] p-1">
							<SunMark variant="white" className="size-3.5" />
						</span>
						Consultoria de consórcio independente
						<span
							className="size-1.5 rounded-full bg-[#28c081] shadow-[0_0_0_3px_rgba(40,192,129,.16)]"
							title="online"
						/>
					</motion.span>

					<motion.h1
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.1 }}
						className="mt-6 max-w-[13ch] text-[clamp(2.4rem,4.6vw,3.6rem)] font-semibold leading-[1.03] tracking-[-0.035em] text-foreground"
					>
						Seu consórcio, resolvido <em className="text-primary not-italic">numa conversa</em>.
					</motion.h1>

					<motion.p
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.2 }}
						className="mt-5 max-w-[42ch] text-lg text-muted-foreground"
					>
						Diga o que você quer conquistar. Nós comparamos as administradoras e encontramos o plano
						certo pra você — sem formulário e sem letra miúda.
					</motion.p>

					{/* Composer */}
					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.3 }}
						className="mt-8 max-w-[540px]"
					>
						<form
							ref={formRef}
							onSubmit={submit}
							className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_1px_2px_rgba(10,31,51,.04),0_20px_54px_-28px_rgba(10,31,51,.2)] transition-colors focus-within:border-[#bcd3ff]"
						>
							<div className="flex items-center gap-2 px-4 pt-3.5 text-xs text-muted-foreground">
								<span className="flex size-6 items-center justify-center rounded-full bg-[var(--surface-ink)] p-1">
									<SunMark variant="white" className="size-3.5" />
								</span>
								<span>Aja Agora</span>
								<span className="size-1.5 rounded-full bg-[#28c081]" title="online" />
							</div>

							<div className="relative px-4 py-3.5">
								<input
									ref={inputRef}
									type="text"
									value={value}
									onChange={(e) => setValue(e.target.value)}
									onFocus={() => setTypingDone(true)}
									aria-label="Conte o que você quer conquistar"
									className="w-full bg-transparent text-lg text-foreground outline-none placeholder:text-transparent"
									placeholder={TYPEWRITER_PHRASES[0]}
								/>
								{!value && (
									<span className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
										{placeholder}
										{!typingDone && (
											<span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-[streaming-cursor-blink_1.1s_steps(1)_infinite] bg-primary align-middle" />
										)}
									</span>
								)}
							</div>

							<div className="flex items-center justify-between gap-3 px-4 pb-3.5">
								<div className="flex flex-wrap gap-2">
									{CHIPS.map((chip) => (
										<button
											key={chip.label}
											type="button"
											onClick={(e) => onOpenChat(chip.fill, e.currentTarget)}
											className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-border bg-[#fbfbf9] px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-[#bcd3ff] hover:text-primary"
										>
											<chip.icon className="size-3.5" strokeWidth={1.8} />
											{chip.label}
										</button>
									))}
								</div>
								<button
									type="submit"
									aria-label="Enviar"
									className="flex size-[46px] shrink-0 items-center justify-center rounded-[13px] bg-primary text-primary-foreground shadow-primary transition-[filter,transform] hover:brightness-105 active:translate-y-px"
								>
									<Send className="size-[18px]" strokeWidth={1.8} />
								</button>
							</div>
						</form>
						<p className="mt-3 text-xs text-[#9aa7b6]">
							<b className="font-semibold text-muted-foreground">Sem compromisso.</b> A primeira
							conversa é por nossa conta.
						</p>
					</motion.div>
				</div>
			</div>
		</header>
	);
}
