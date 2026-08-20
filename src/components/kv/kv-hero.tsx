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
		// Uma lista só, e um lugar só na tela desde 20/08: o trio que ficava fora
		// do card oferecia esta mesma escolha uma segunda vez.
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
//   • a manchete abre a seção — o parágrafo do problema que estava acima dela
//     saiu na segunda rodada do dia, por empurrar a manchete para fora da
//     primeira dobra no celular;
//   • a promessa fecha em uma linha, e os três caminhos viram o TRIO, visual e
//     clicável — que na segunda rodada do dia entrou PARA DENTRO do card, no
//     lugar das pílulas: eram a mesma escolha oferecida duas vezes;
//   • o card se chama "Fale com a Aja" e diz o que fazer com o trio;
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
					{/* A manchete abre a seção. O parágrafo do problema ("Comparar tudo
					    isso sozinho leva tempo…") saiu daqui em 20/08 (decisão do Kairo):
					    empurrava a manchete para baixo da dobra no celular, e quem chega
					    já sabe que comparar sozinho é chato — o que ele não sabe é que
					    existe um lugar onde isso já está comparado, que é o que a
					    manchete diz. */}
					<h1 className="text-[40px] font-normal leading-[1.08] tracking-[-0.01em] text-[#021628] md:text-[56px] md:leading-[62px]">
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

					{/* Search card — o único bloco de escolha da coluna. O trio que ficava
					    aqui fora saiu em 20/08 (decisão do Kairo): ele e as pílulas de
					    dentro do card ofereciam a MESMA escolha duas vezes, uma logo
					    embaixo da outra. Sobrou uma, no lugar onde a ação acontece. */}
					<form
						ref={formRef}
						onSubmit={submit}
						className={`mt-5 max-w-[514px] rounded-[16px] bg-white px-5 pb-5 pt-4 ${CARD_SHADOW} sm:px-6 md:mt-7`}
					>
						<div className="flex items-start gap-2.5 pt-1">
							<span className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[#021628]">
								<AjaMark className="w-[21px] text-white" />
							</span>
							{/* A chamada que instrui. "Consultor independente" dizia o que a Aja
							    é; isto diz o que fazer com os chips logo abaixo. */}
							<span className="flex flex-col">
								<span className="text-[20px] leading-tight text-[#000]">Fale com a Aja</span>
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
							className="mt-4 min-h-[44px] w-full bg-transparent text-[19px] font-light leading-[1.35] text-[#021628] outline-none placeholder:text-[#6B6B66]"
						/>
						{/* O seletor de categoria, no tamanho de card — era a pílula de 96x27
						    do comp, e passou a ser este trio quando o de fora saiu. Alvo de
						    dedo de verdade, e o `apoio` responde a dúvida que a pílula
						    deixava aberta ("moto de trabalho conta?").

						    `aria-label` com o rótulo puro: sem ele o nome acessível seria a
						    frase inteira do cartão ("Carro Zero km ou seminovo"), e quem
						    navega por voz teria que dizer tudo pra tocar num botão que se
						    chama Carro.

						    Regra que não mudou (FIX-75): o que a pessoa DIGITOU vence o
						    canned do chip. */}
						<div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
							{SEARCH_CHIPS.map((chip) => (
								<button
									key={chip.label}
									type="button"
									aria-label={chip.label}
									onClick={(e) =>
										value.trim()
											? onOpenChat(value.trim(), e.currentTarget, "digitada")
											: onOpenChat(chip.fill, e.currentTarget, "chip")
									}
									className="flex h-full w-full flex-col items-center justify-start gap-2 rounded-[12px] border border-[#021628]/10 bg-[#FBFBF9] px-2 py-4 text-center transition-colors hover:border-[#F2404F]/30 hover:bg-white"
								>
									<span className="flex size-12 items-center justify-center rounded-full bg-[#FFE0E3]">
										<chip.icon className="size-6 text-[#F2404F]" strokeWidth={1.75} />
									</span>
									<span className="text-[15px] font-semibold leading-none text-[#021628]">
										{chip.label}
									</span>
									<span className="text-[11px] leading-[1.2] text-[#6B6B66]">{chip.apoio}</span>
								</button>
							))}
						</div>
						{/* O aviãozinho do comp saiu daqui. Um ícone não dizia o que ia
						    acontecer ao ser tocado, e 37px é alvo pequeno pra dedo — este é
						    o botão que fecha a ação principal da página. Mesmo molde do card
						    das verticais (hero-vertical.tsx). */}
						<KvCtaButton type="submit" className="mt-4 h-[54px] w-full text-[16px]">
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
