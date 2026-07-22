"use client";

import { Bike, Car, Home as HomeIcon, Send } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useRef, useState } from "react";

import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { CARD_SHADOW, KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";

const KV = "/kv";

const SEARCH_CHIPS = [
	{ icon: HomeIcon, label: "Imóvel", fill: "Quero comprar um imóvel." },
	{ icon: Car, label: "Carro", fill: "Quero comprar um carro." },
	{ icon: Bike, label: "Moto", fill: "Quero comprar uma moto." },
];

// Lettermark curto "AJA" (variante 'Curto — fundo escuro' do design system). Reaproveita
// os glifos A-J-A da parte superior do lockup oficial (src/components/brand/wordmark.tsx),
// recortados via viewBox. Segue currentColor (claro sobre o navy do badge/avatar).
function AjaMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="165 158 540 172"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="AJA"
			className={className}
		>
			<polygon points="215.29 323.78 275.58 214.54 335.47 323.78 382.3 323.78 294.76 166.11 255.64 166.11 168.87 323.78" />
			<path d="M456.44,163.77v60.32c0,33.62-27.35,60.97-60.97,60.97-7.1,0-13.89-1.28-20.21-3.55l-.35.35,23.13,41.67c53.7-1.38,96.99-45.4,96.99-99.44v-60.32h-38.6Z" />
			<polygon points="533.64 323.22 593.94 213.98 653.82 323.22 700.65 323.22 613.12 165.55 573.99 165.55 487.22 323.22" />
		</svg>
	);
}

interface KvHeroProps {
	onOpenChat: TheaterOpener;
}

// Hero (Figma frame 'Hero' 1440x873): duas colunas — bloco de texto + colagem de fotos
// (tríptico carro/moto/casa + sunburst coral atrás do recorte da consultora). Blob navy
// desfocado no canto inferior-esquerdo.
export function KvHero({ onOpenChat }: KvHeroProps) {
	const [value, setValue] = useState("");
	const formRef = useRef<HTMLFormElement>(null);

	// Enviar / Enter → abre o teatro com o texto digitado (vazio = saudação).
	const submit = (e?: FormEvent) => {
		e?.preventDefault();
		onOpenChat(value.trim(), formRef.current);
	};

	return (
		<section className="relative overflow-hidden bg-[#FAFAF3]">
			{/* Blob navy desfocado (Figma 'Blob' 720x757 @(-236,635)) */}
			<div className="pointer-events-none absolute -bottom-40 -left-40 size-[560px] rounded-full bg-[#021628] opacity-10 blur-[120px]" />
			{/* Blob coral desfocado, canto superior direito (Figma: 720x756.67
			    @(1021,-225), opacity .95, blur 334.8). */}
			<div className="pointer-events-none absolute -top-[225px] -right-[301px] h-[757px] w-[720px] rounded-full bg-[#FFE0E3] opacity-95 blur-[335px]" />

			<KvContainer className="grid max-w-[1240px] items-center gap-12 py-6 lg:grid-cols-[560px_1fr] lg:gap-[80px] lg:py-8">
				{/* Coluna de texto */}
				<div className="max-w-[560px]">
					<span className="inline-flex items-center gap-2 rounded-full bg-[#021628] py-1.5 pl-3.5 pr-4 text-[16px] font-semibold text-[#FAFAF3]">
						<AjaMark className="h-3 w-auto text-[#FAFAF3]" />
						Parceria independente para consórcio
					</span>

					<h1 className="mt-6 text-[40px] font-normal leading-[1.08] tracking-[-0.01em] text-[#021628] md:text-[56px] md:leading-[62px]">
						<Em>Compare</Em> consórcios
						<br />
						entre diversas
						<br />
						<Em>administradoras</Em>
					</h1>

					<p className="mt-6 max-w-[507px] text-[18px] leading-[1.35] text-[#2D2D2D] md:text-[22px] md:leading-[26px]">
						Comparar tudo isso sozinho leva tempo e aumenta a chance de uma escolha ruim.
						<br />A Aja reúne essas informações em um único lugar para{" "}
						<Em>facilitar sua decisão.</Em>
					</p>

					{/* Search card */}
					<form
						ref={formRef}
						onSubmit={submit}
						className={`mt-8 max-w-[514px] rounded-[12px] bg-white px-6 pb-3 pt-3 ${CARD_SHADOW}`}
					>
						<div className="flex items-center gap-2.5 pt-1">
							<span className="flex size-[31px] items-center justify-center rounded-full bg-[#021628]">
								<AjaMark className="w-[18px] text-white" />
							</span>
							<span className="text-[18px] text-[#000]">Consultor independente</span>
						</div>
						<input
							type="text"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder="Quero um carro até R$ 80 Mil..."
							aria-label="O que você está buscando?"
							className="mt-3 w-full bg-transparent text-[18px] font-light text-[#021628] outline-none placeholder:text-[#6B6B66]"
						/>
						<div className="mt-4 flex flex-wrap items-center gap-2 gap-y-2 sm:flex-nowrap sm:gap-3">
							{SEARCH_CHIPS.map((chip) => (
								<button
									key={chip.label}
									type="button"
									onClick={(e) => onOpenChat(value.trim() || chip.fill, e.currentTarget)}
									className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#FBFBF9] px-3.5 py-1.5 text-[10px] font-semibold text-[#021628] transition-colors hover:bg-[#F2404F]/10"
								>
									<chip.icon className="size-3.5" strokeWidth={2} />
									{chip.label}
								</button>
							))}
							<button
								type="submit"
								aria-label="Enviar"
								className="flex size-[37px] shrink-0 items-center justify-center rounded-[6px] bg-[#FFE0E3] text-[#F2404F] sm:ml-auto"
							>
								<Send className="size-4" strokeWidth={2} />
							</button>
						</div>
					</form>

					{/* CTAs */}
					<div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
						<KvCtaButton onClick={(e) => onOpenChat("", e.currentTarget)}>
							Fale com a AJA
						</KvCtaButton>
						<KvCtaButton variant="outline" onClick={(e) => onOpenChat("", e.currentTarget)}>
							Financiamento <Em className="mx-1">vs</Em> Consórcio
						</KvCtaButton>
					</div>
				</div>

				{/* Colagem de fotos — PNG único (tríptico + consultora + sunburst + balões
				    já compostos na arte), substitui os componentes separados anteriores. */}
				<div className="relative mx-auto aspect-[617/615] w-full max-w-[560px]">
					<Image
						src={`${KV}/hero-collage.png`}
						alt="Consultora da Aja Agora cercada por opções de carro, moto e imóvel, com balões de chat mostrando a conversa com o consórcio"
						fill
						sizes="(min-width: 1024px) 560px, 90vw"
						priority
						quality={100}
						className="object-contain"
					/>
				</div>
			</KvContainer>
		</section>
	);
}
