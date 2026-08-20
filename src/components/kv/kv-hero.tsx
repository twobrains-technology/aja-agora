"use client";

import { Car, Home as HomeIcon, Motorbike, Send } from "lucide-react";
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
		// `apoio` só aparece no trio do mobile; o chip dentro do card mostra apenas
		// o rótulo. Uma lista só para os dois porque é a MESMA categoria: duas
		// listas divergiriam na primeira vez que alguém trocasse uma frase-semente.
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
// O mobile diverge do desktop DE PROPÓSITO (pedido do cliente, 2026-08-20).
//
// Os pares `md:hidden` / `hidden md:…` espalhados aqui não são descuido: no
// celular o topo empilhava pílula + manchete + parágrafo + card + dois CTAs, e a
// pílula escura competia com os botões de verdade. O que muda abaixo de `md`:
//
//   • a pílula "o jeito independente…" sai (a frase reaparece em faixa própria
//     antes do rodapé — <KvIndependente/>);
//   • no lugar dela sobe a primeira frase do parágrafo, em texto puro;
//   • o resto do parágrafo vira o TRIO Imóvel/Carro/Moto, visual e clicável;
//   • o card se apresenta como "Fale com a Aja" e diz o que fazer ali;
//   • o campo digita sozinho, em vez de placeholder parado;
//   • o aviãozinho vira o CTA "Quero minha simulação";
//   • "Fale com a AJA" abaixo do card sai — a chamada agora é o título do card.
//
// O desktop segue idêntico ao comp do Figma. Mexer num lado sem olhar o outro é
// o jeito de deixar as duas versões dizendo coisas diferentes.
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
					<span className="hidden items-center gap-2 rounded-full bg-[#021628] py-1.5 pl-3.5 pr-4 text-[16px] font-semibold text-[#FAFAF3] md:inline-flex">
						<AjaMark className="h-3 w-auto text-[#FAFAF3]" />o jeito independente de escolher
						consórcio
					</span>

					{/* Mobile: o problema vem antes da promessa, e em texto puro — o que a
					    pílula tinha de errado não era a frase, era parecer um botão. */}
					<p className="text-[15px] leading-[1.4] text-[#2D2D2D] md:hidden">
						Comparar tudo isso sozinho leva tempo e aumenta a chance de uma escolha ruim.
					</p>

					<h1 className="mt-4 text-[40px] font-normal leading-[1.08] tracking-[-0.01em] text-[#021628] md:mt-6 md:text-[56px] md:leading-[62px]">
						<Em>Compare</Em> consórcios
						<br />
						entre diversas
						<br />
						<Em>administradoras</Em>
					</h1>

					<p className="mt-6 hidden max-w-[507px] text-[18px] leading-[1.35] text-[#2D2D2D] md:block md:text-[22px] md:leading-[26px]">
						Comparar tudo isso sozinho leva tempo e aumenta a chance de uma escolha ruim.
						<br />A Aja reúne essas informações em um único lugar para{" "}
						<Em>facilitar sua decisão.</Em>
					</p>

					{/* Mobile: a promessa curta, e logo os três caminhos. */}
					<p className="mt-4 text-[16px] leading-[1.35] text-[#2D2D2D] md:hidden">
						A Aja reúne essas informações em um único lugar para <Em>facilitar sua decisão.</Em>
					</p>

					{/* Trio Imóvel/Carro/Moto — o parágrafo do desktop virou isto no celular.
					    São botões, e não enfeite: é o bloco mais visível da tela, e mandar o
					    cliente pro chat com a categoria já escolhida é o que ele existe pra
					    fazer.

					    O `aria-label` NÃO pode ser só "Carro": os chips dentro do card já
					    têm esse nome, e dois botões com o mesmo nome acessível deixam a
					    página ambígua pra leitor de tela (e pro `getByRole` dos testes). */}
					<ul className="mt-6 grid grid-cols-3 gap-3 md:hidden">
						{SEARCH_CHIPS.map((chip) => (
							<li key={chip.label}>
								<button
									type="button"
									aria-label={`Consórcio de ${chip.label.toLowerCase()}`}
									onClick={(e) => onOpenChat(chip.fill, e.currentTarget, "chip")}
									className="flex w-full flex-col items-center gap-2 rounded-[12px] border border-[#021628]/10 bg-white/60 px-2 py-3 text-center transition-colors hover:bg-white"
								>
									<span className="flex size-11 items-center justify-center rounded-full bg-[#FFE0E3]">
										<chip.icon className="size-5 text-[#F2404F]" strokeWidth={1.75} />
									</span>
									<span className="text-[14px] font-semibold leading-none text-[#021628]">
										{chip.label}
									</span>
									<span className="text-[11px] leading-[1.25] text-[#6B6B66]">{chip.apoio}</span>
								</button>
							</li>
						))}
					</ul>

					{/* Search card */}
					<form
						ref={formRef}
						onSubmit={submit}
						className={`mt-8 max-w-[514px] rounded-[12px] bg-white px-6 pb-3 pt-3 ${CARD_SHADOW}`}
					>
						{/* `items-start` no mobile por causa do subtítulo de duas linhas; o desktop
						    fica no `items-center` do comp, onde o título é uma linha só. */}
						<div className="flex items-start gap-2.5 pt-1 md:items-center">
							<span className="flex size-[31px] shrink-0 items-center justify-center rounded-full bg-[#021628]">
								<AjaMark className="w-[18px] text-white" />
							</span>
							<span className="hidden text-[18px] text-[#000] md:inline">
								Consultor independente
							</span>
							{/* Mobile: a chamada que instrui. "Consultor independente" dizia o que
							    a Aja é; isto diz o que fazer com os chips logo abaixo. */}
							<span className="flex flex-col md:hidden">
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
							<button
								type="submit"
								aria-label="Enviar"
								// O rosa claro do comp é discreto demais para sinalizar sozinho que
								// isto envia a busca: no hover ele vira o vermelho da marca, com o
								// ícone em branco.
								className="hidden size-[37px] shrink-0 items-center justify-center rounded-[6px] bg-[#FFE0E3] text-[#F2404F] transition-colors hover:bg-[#F2404F] hover:text-white sm:ml-auto md:flex"
							>
								<Send className="size-4" strokeWidth={2} />
							</button>
						</div>
						{/* Mobile: o aviãozinho não dizia o que ia acontecer ao ser tocado, e é
						    alvo pequeno pra dedo. Mesmo molde do card das verticais. */}
						<KvCtaButton type="submit" className="mb-1 mt-4 h-12 w-full text-[15px] md:hidden">
							Quero minha simulação
						</KvCtaButton>
					</form>

					{/* CTAs */}
					<div className="mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-5">
						{/* "Fale com a AJA" só no desktop: no mobile essa chamada virou o
						    título do card acima, e repeti-la aqui é o CTA duplicado que o
						    cliente marcou no comp. */}
						<KvCtaButton
							className="hidden md:inline-flex"
							onClick={(e) => onOpenChat("", e.currentTarget)}
						>
							Fale com a AJA
						</KvCtaButton>
						<KvCtaButton variant="outline" onClick={(e) => onOpenChat("", e.currentTarget)}>
							Encontre o consórcio certo
						</KvCtaButton>
					</div>
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
