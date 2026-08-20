"use client";

import { Car, Home as HomeIcon, Motorbike } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useRef, useState } from "react";

import { AjaMark } from "@/components/brand/aja-mark";
import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { CARD_SHADOW, KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";
import { KV_RITMO, KvSection } from "@/components/kv/ui/kv-section";
import { usePlaceholderDigitando } from "@/components/kv/ui/use-placeholder-digitando";

const KV = "/kv";

const SEARCH_CHIPS = [
	{
		icon: HomeIcon,
		label: "Imóvel",
		// `apoio` só aparece no trio; o chip dentro do card mostra apenas o rótulo.
		// Uma lista só para os dois porque é a MESMA categoria: duas listas
		// divergiriam na primeira vez que alguém trocasse uma frase-semente.
		apoio: "Casa, apê ou terreno",
		fill: "Quero comprar um imóvel.",
	},
	{ icon: Car, label: "Carro", apoio: "Zero km ou seminovo", fill: "Quero comprar um carro." },
	// `Motorbike` e não `Bike`: o lucide `Bike` é bicicleta, com pedal e quadro —
	// desenho errado para quem vende consórcio de moto, e diferente do que o
	// submenu de verticais mostra. Os dois falam da mesma coisa, mostram a mesma.
	{
		icon: Motorbike,
		label: "Moto",
		apoio: "Trabalho ou passeio",
		fill: "Quero comprar uma moto.",
	},
];

interface KvHeroProps {
	onOpenChat: TheaterOpener;
}

// Hero (Figma frame 'Hero' 1440x873): duas colunas — bloco de texto + colagem de fotos
// (tríptico carro/moto/casa + sunburst coral atrás do recorte da consultora). Blob navy
// desfocado no canto inferior-esquerdo.
//
// ---------------------------------------------------------------------------
// DIVERGE DO COMP, e de propósito (marcações do cliente, 2026-08-20).
//
// O comp empilhava pílula escura, manchete, parágrafo, card e DOIS botões de
// conversão. A pílula parecia um botão e disputava o toque com os CTAs de
// verdade; o parágrafo era parede de texto onde cabia algo visual; e o card se
// apresentava como "Consultor independente", que diz o que a Aja É e não o que
// fazer ali. O que está aqui hoje:
//
//   • sem pílula — a frase virou assinatura de marca no rodapé
//     (<KvIndependente/>), onde não compete com nada;
//   • o problema abre a seção, em texto puro, acima da manchete;
//   • a promessa fecha em uma linha, e os três caminhos viram o TRIO, visual e
//     clicável;
//   • o card se chama "Fale com a Aja" e diz o que fazer com os chips;
//   • o campo digita sozinho, em vez de placeholder parado;
//   • um CTA dentro do card ("Quero minha simulação") e UM abaixo dele.
//
// As medidas do comp que sobrevivem (coluna de 560px, manchete de 56/62,
// colagem 1999/1909) continuam valendo — o que mudou foi o conteúdo da coluna,
// não a grade. Isto nasceu num ajuste só de mobile e foi unificado em seguida:
// manter dois desenhos era manter dois produtos na mesma página.
// ---------------------------------------------------------------------------
export function KvHero({ onOpenChat }: KvHeroProps) {
	const [value, setValue] = useState("");
	const [focado, setFocado] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);

	const placeholder = usePlaceholderDigitando({ valor: value, focado });

	// Enviar / Enter → abre o teatro com o texto digitado (vazio = saudação).
	const submit = (e?: FormEvent) => {
		e?.preventDefault();
		onOpenChat(value.trim(), formRef.current);
	};

	return (
		<KvSection rhythm={KV_RITMO.hero} className="overflow-hidden bg-[#FAFAF3]">
			{/* Blob navy desfocado (Figma 'Blob' 720x757 @(-236,635)) */}
			<div className="pointer-events-none absolute -bottom-40 -left-40 size-[560px] rounded-full bg-[#021628] opacity-10 blur-[120px]" />
			{/* Blob coral desfocado, canto superior direito (Figma: 720x756.67
			    @(1021,-225), opacity .95, blur 334.8). */}
			<div className="pointer-events-none absolute -top-[225px] -right-[301px] h-[757px] w-[720px] rounded-full bg-[#FFE0E3] opacity-95 blur-[335px]" />

			<KvContainer className="grid items-center gap-12 lg:grid-cols-[560px_1fr] lg:gap-[80px]">
				{/* Coluna de texto */}
				<div className="max-w-[560px]">
					{/* O problema vem antes da promessa, e em texto puro — o que a pílula
					    tinha de errado não era a frase, era parecer um botão. */}
					<p className="max-w-[507px] text-[15px] leading-[1.4] text-[#2D2D2D] md:text-[18px] md:leading-[1.45]">
						Comparar tudo isso sozinho leva tempo e aumenta a chance de uma escolha ruim.
					</p>

					<h1 className="mt-4 text-[40px] font-normal leading-[1.08] tracking-[-0.01em] text-[#021628] md:mt-5 md:text-[56px] md:leading-[62px]">
						<Em>Compare</Em> consórcios
						<br />
						entre diversas
						<br />
						<Em>administradoras</Em>
					</h1>

					{/* A promessa em uma linha. Era a segunda metade do parágrafo do comp;
					    a primeira subiu para cima da manchete. */}
					<p className="mt-4 max-w-[507px] text-[16px] leading-[1.35] text-[#2D2D2D] md:mt-5 md:text-[20px] md:leading-[26px]">
						A Aja reúne essas informações em um único lugar para <Em>facilitar sua decisão.</Em>
					</p>

					{/* Trio Imóvel/Carro/Moto — o resto do parágrafo do comp virou isto.
					    São botões, e não enfeite: é o bloco mais visível da coluna, e
					    mandar o cliente pro chat com a categoria já escolhida é o que ele
					    existe pra fazer.

					    O `aria-label` NÃO pode ser só "Carro": os chips dentro do card já
					    têm esse nome, e dois botões com o mesmo nome acessível deixam a
					    página ambígua pra leitor de tela (e pro `getByRole` dos testes). */}
					<ul className="mt-6 grid max-w-[514px] grid-cols-3 gap-3 md:mt-7 md:gap-4">
						{SEARCH_CHIPS.map((chip) => (
							<li key={chip.label}>
								<button
									type="button"
									aria-label={`Consórcio de ${chip.label.toLowerCase()}`}
									onClick={(e) => onOpenChat(chip.fill, e.currentTarget, "chip")}
									className="flex w-full flex-col items-center gap-2 rounded-[12px] border border-[#021628]/10 bg-white/60 px-2 py-3 text-center transition-colors hover:border-[#F2404F]/30 hover:bg-white md:gap-2.5 md:py-4"
								>
									<span className="flex size-11 items-center justify-center rounded-full bg-[#FFE0E3] md:size-12">
										<chip.icon className="size-5 text-[#F2404F] md:size-6" strokeWidth={1.75} />
									</span>
									<span className="text-[14px] font-semibold leading-none text-[#021628] md:text-[15px]">
										{chip.label}
									</span>
									<span className="text-[11px] leading-[1.25] text-[#6B6B66] md:text-[12px]">
										{chip.apoio}
									</span>
								</button>
							</li>
						))}
					</ul>

					{/* Search card */}
					<form
						ref={formRef}
						onSubmit={submit}
						className={`mt-6 max-w-[514px] rounded-[12px] bg-white px-6 pb-4 pt-3 ${CARD_SHADOW} md:mt-7`}
					>
						<div className="flex items-start gap-2.5 pt-1">
							<span className="flex size-[31px] shrink-0 items-center justify-center rounded-full bg-[#021628]">
								<AjaMark className="w-[18px] text-white" />
							</span>
							{/* A chamada que instrui. "Consultor independente" dizia o que a Aja
							    é; isto diz o que fazer com os chips logo abaixo. */}
							<span className="flex flex-col">
								<span className="text-[18px] leading-tight text-[#000]">Fale com a Aja</span>
								<span className="mt-0.5 text-[13px] leading-[1.3] text-[#6B6B66]">
									Selecione o tipo de consórcio para comparar
								</span>
							</span>
						</div>
						<input
							type="text"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onFocus={() => setFocado(true)}
							onBlur={() => setFocado(false)}
							placeholder={placeholder}
							aria-label="O que você está buscando?"
							className="mt-3 w-full bg-transparent text-[18px] font-light text-[#021628] outline-none placeholder:text-[#6B6B66]"
						/>
						<div className="mt-4 flex flex-wrap items-center gap-2 gap-y-2 sm:flex-nowrap sm:gap-3">
							{SEARCH_CHIPS.map((chip) => (
								<button
									key={chip.label}
									type="button"
									onClick={(e) =>
										value.trim()
											? onOpenChat(value.trim(), e.currentTarget, "digitada")
											: onOpenChat(chip.fill, e.currentTarget, "chip")
									}
									// Pílula com contorno navy, e não retângulo chapado: no comp os três
									// chips são `Button` 96x27 com stroke #052440 e raio total.
									className="inline-flex w-[96px] items-center justify-center gap-1.5 rounded-full border border-[#052440] bg-[#FBFBF9] px-3.5 py-1.5 text-[10px] font-semibold text-[#021628] transition-colors hover:bg-[#F2404F]/10"
								>
									<chip.icon className="size-3.5" strokeWidth={1.5} />
									{chip.label}
								</button>
							))}
						</div>
						{/* O aviãozinho do comp saiu daqui. Um ícone não dizia o que ia
						    acontecer ao ser tocado, e 37px é alvo pequeno pra dedo — este é
						    o botão que fecha a ação principal da página. Mesmo molde do card
						    das verticais (hero-vertical.tsx). */}
						<KvCtaButton type="submit" className="mt-4 h-12 w-full text-[15px]">
							Quero minha simulação
						</KvCtaButton>
					</form>

					{/* NENHUM CTA SOLTO ABAIXO DO CARD (decisão do Kairo, 20/08/2026).
					    Hoje de manhã saiu o "Fale com a AJA" — a chamada virou o título do
					    card — e agora sai também o "Encontre o consórcio certo": o card
					    fecha a ação com o "Quero minha simulação", e o trio acima já leva
					    à conversa com a categoria escolhida. Três caminhos para o mesmo
					    lugar, um embaixo do outro, é o empilhamento que o cliente marcou.

					    A conversa continua alcançável de qualquer ponto da página pelo
					    botão flutuante (<ChatFlutuante/>) e pelo fecho (kv-footer.tsx). */}
				</div>

				{/* Colagem de fotos — PNG único (tríptico + consultora + sunburst + balões
				    já compostos na arte), substitui os componentes separados anteriores. */}
				<div className="relative mx-auto aspect-[1999/1909] w-full max-w-[560px]">
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
		</KvSection>
	);
}
