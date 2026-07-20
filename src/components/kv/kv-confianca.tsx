"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Em } from "@/components/kv/em";
import { CARD_SHADOW, KvContainer } from "@/components/kv/ui/kv-container";

const KV = "/kv";

type CriterioCard = {
	id: string;
	emoji: string;
	title: string;
	description: string;
};

// Frame 'Confiança e Segurança': painel coral (headline) → faixa cream com
// carrossel horizontal de 6 cards de critério → faixa navy full-width
// (logo à esquerda + "Saúde financeira" à direita) com a imagem sobrepondo
// entre as duas. Ordem replica o blueprint (coral → cream → navy), não a
// composição anterior (coral+navy+imagem → cards) que tinha desviado do design.
const CRITERIOS: CriterioCard[] = [
	{
		id: "taxa-administracao",
		emoji: "📊",
		title: "Taxa de administração",
		description: "Encontramos grupos com melhor custo-benefício para que você pague menos taxas.",
	},
	{
		id: "lance-medio",
		emoji: "🚀",
		title: "Lance médio",
		description:
			"Mostramos qual o valor médio dos lances vencedores para aumentar sua previsibilidade de contemplação.",
	},
	{
		id: "diversas-administradoras",
		emoji: "🏦",
		title: "Diversas administradoras",
		description:
			"Você compara diferentes empresas autorizadas pelo Banco Central em um único lugar.",
	},
	{
		id: "prazo",
		emoji: "📅",
		title: "Prazo",
		description: "Encontramos prazos compatíveis com sua realidade financeira e objetivos de vida.",
	},
	{
		id: "valor-parcela",
		emoji: "💳",
		title: "Valor da parcela",
		description:
			"Buscamos uma parcela saudável que caiba perfeitamente no seu planejamento mensal.",
	},
	{
		id: "historico-grupos",
		emoji: "🏆",
		title: "Histórico dos grupos",
		description:
			"Sempre que disponível, utilizamos indicadores reais que ajudam a tomar a melhor decisão.",
	},
];

// Frame 'aja-mobile' (Figma, 402px): mobile usa 3 dos critérios (não os 6 do
// desktop), empilhados full-width, com título/copy próprios do blueprint —
// lista separada, não um subconjunto renderizado do array acima.
const CRITERIOS_MOBILE: CriterioCard[] = [
	{
		id: "lance-medio-mobile",
		emoji: "🚀",
		title: "Lance médio",
		description:
			"Mostramos qual o valor médio dos lances vencedores para aumentar sua previsibilidade de contemplação.",
	},
	{
		id: "diversas-administradoras-mobile",
		emoji: "🏦",
		title: "Diversas administradoras",
		description:
			"Você compara diferentes empresas autorizadas pelo Banco Central em um único lugar, de forma simples.",
	},
	{
		id: "prazo-competitivo-mobile",
		emoji: "📅",
		title: "Prazo competitivo",
		description:
			"Encontramos prazos compatíveis com sua realidade financeira e objetivos de vida de longo prazo.",
	},
];

// Card de critério (ícone circular + emoji + título Merriweather + descrição).
// Mesma estrutura no mobile (3 itens, ícone sólido) e no desktop (6 itens no
// carrossel, ícone tintado) — só tamanho/padding mudam entre os 2 frames do
// Figma (breakpoint `size`).
function CriterioCardItem({
	criterio,
	size,
	"aria-hidden": ariaHidden,
}: {
	criterio: CriterioCard;
	size: "sm" | "lg";
	"aria-hidden"?: boolean;
}) {
	if (size === "sm") {
		return (
			<li
				aria-hidden={ariaHidden}
				className={`flex flex-col gap-4 rounded-[16px] bg-[#FFFFFF] p-6 ${CARD_SHADOW}`}
			>
				<span
					className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#F2404F]"
					aria-hidden="true"
				>
					<span className="text-[22px] leading-none">{criterio.emoji}</span>
				</span>
				<div className="flex flex-col gap-1.5">
					<h3 className="font-[family-name:var(--font-merriweather)] text-[18px] font-bold leading-[26px] text-[#021628]">
						{criterio.title}
					</h3>
					<p className="text-[14px] leading-[20px] text-[#4B5563]">{criterio.description}</p>
				</div>
			</li>
		);
	}

	return (
		<li
			aria-hidden={ariaHidden}
			className={`flex w-[280px] shrink-0 snap-start flex-col gap-5 rounded-[16px] bg-[#FFFFFF] p-8 ${CARD_SHADOW}`}
		>
			<span
				className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#F2404F]/[0.06]"
				aria-hidden="true"
			>
				<span className="text-[28px] leading-none">{criterio.emoji}</span>
			</span>
			<div className="flex flex-col gap-2">
				<h3 className="font-[family-name:var(--font-merriweather)] text-[20px] font-semibold leading-[28px] text-[#000000]">
					{criterio.title}
				</h3>
				<p className="text-[16px] leading-[22px] text-[#000000]">{criterio.description}</p>
			</div>
		</li>
	);
}

// Largura do card (280px) + gap (16px) do carrossel desktop — usado pra abrir
// a janela já deslocada 1 card (ver useEffect abaixo) e pra avançar o autoplay
// um card por vez.
const CARROSSEL_CARD_STEP = 280 + 16;

// Intervalo do autoplay entre um card e o próximo.
const CARROSSEL_AUTOPLAY_MS = 2200;

// Carrossel desktop dos 6 critérios. Abre com scroll já deslocado 1 card: a
// janela ('Mask group' 66% da faixa) mostra "Lance médio" (cortado à esquerda),
// "Diversas administradoras" e "Prazo" inteiros — batendo com o recorte do
// Figma, que não abre no primeiro card (senão os pingos do regador caem no
// vazio depois de "Diversas administradoras" em vez de molhar "Prazo").
//
// Autoplay: avança um card por vez sempre pra frente, em loop contínuo; pausa
// no hover (sem controles visíveis, o scroll manual continua funcionando a
// qualquer momento via overflow-x-auto).
//
// Pra "voltar" do último card ao primeiro sem o scroll animar de trás pra
// frente (glitch de reverso), a lista renderiza os critérios duas vezes: o
// autoplay sempre avança (nunca usa `% length` pra decidir o destino do
// scroll), e ao entrar no trecho clonado — visualmente idêntico ao original —
// espera o scroll assentar e salta sem animação de volta pra posição
// equivalente no trecho original. O salto é imperceptível porque os dois
// trechos são pixel-a-pixel iguais.
//
// O "esperar assentar" é feito checando `scrollLeft` direto via rAF (não
// pelo evento `scrollend`): esse evento pode não disparar em todo navegador/
// contexto, e se não disparar o reset nunca acontece — o autoplay então
// segue avançando só pra frente até bater no fim físico do conteúdo clonado
// e travar no último card (foi exatamente o sintoma visto: parava em
// "Histórico dos grupos" e não continuava).
function waitForScrollSettle(el: HTMLElement, onSettle: () => void, signal: AbortSignal) {
	let lastLeft = el.scrollLeft;
	let stableFrames = 0;

	const check = () => {
		if (signal.aborted) return;
		if (el.scrollLeft === lastLeft) {
			stableFrames += 1;
			if (stableFrames >= 2) {
				onSettle();
				return;
			}
		} else {
			stableFrames = 0;
			lastLeft = el.scrollLeft;
		}
		requestAnimationFrame(check);
	};

	requestAnimationFrame(check);
}

function CriteriosCarousel() {
	const listRef = useRef<HTMLUListElement>(null);
	const [isHovered, setIsHovered] = useState(false);

	useEffect(() => {
		listRef.current?.scrollTo({ left: CARROSSEL_CARD_STEP });
	}, []);

	useEffect(() => {
		if (isHovered) return;
		const list = listRef.current;
		if (!list) return;

		const controller = new AbortController();
		const id = window.setInterval(() => {
			const currentIndex = Math.round(list.scrollLeft / CARROSSEL_CARD_STEP);
			const nextIndex = currentIndex + 1;
			list.scrollTo({ left: nextIndex * CARROSSEL_CARD_STEP, behavior: "smooth" });

			if (nextIndex >= CRITERIOS.length) {
				waitForScrollSettle(
					list,
					() => {
						list.scrollTo({
							left: (nextIndex - CRITERIOS.length) * CARROSSEL_CARD_STEP,
							behavior: "instant",
						});
					},
					controller.signal,
				);
			}
		}, CARROSSEL_AUTOPLAY_MS);

		return () => {
			window.clearInterval(id);
			controller.abort();
		};
	}, [isHovered]);

	return (
		<ul
			ref={listRef}
			aria-label="Critérios que a AJA compara"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{CRITERIOS.map((criterio) => (
				<CriterioCardItem key={criterio.id} criterio={criterio} size="lg" />
			))}
			{CRITERIOS.map((criterio) => (
				<CriterioCardItem key={`${criterio.id}-clone`} criterio={criterio} size="lg" aria-hidden />
			))}
		</ul>
	);
}

export function KvConfianca() {
	return (
		<section aria-labelledby="confianca-heading" className="bg-[#FAFAF3]">
			{/* MOBILE (<lg): frame 'aja-mobile' — header e faixa navy full-bleed, 3 cards empilhados */}
			<div className="lg:hidden">
				<div className="bg-[#F2404F] px-6 pt-10 pb-5">
					<h2 className="text-[28px] font-normal leading-[36px] text-[#FAFAF3]">
						Como a AJA{" "}
						<Em w="black" italic={false}>
							compara
						</Em>{" "}
						as melhores alternativas para você...
					</h2>
					<p className="mt-3 text-[14px] leading-[22px] text-[#FAFAF3]">
						Não basta comparar parcelas. Também avaliamos: taxa de administração, prazo, histórico
						de contemplação, lance médio, regras do grupo e condições da carta.
					</p>
				</div>

				<ul
					aria-label="Critérios que a AJA compara"
					className="flex flex-col gap-4 px-6 pt-8 pb-10"
				>
					{CRITERIOS_MOBILE.map((criterio) => (
						<CriterioCardItem key={criterio.id} criterio={criterio} size="sm" />
					))}
				</ul>

				<div className="bg-[#021628] px-6 pt-12">
					{/* Figma 'Dark Logo Container' al:CENTER — logo branca centrada na faixa navy */}
					<Wordmark className="mx-auto block h-[58px] w-auto text-[#FAFAF3]" />
					<div className="mt-8 text-center">
						<p className="text-[28px] leading-[36px] text-[#FAFAF3]">Saúde financeira</p>
						<p className="mt-3 text-[15px] leading-[24px] text-[#FAFAF3]">
							Nosso objetivo não é vender qualquer consórcio.{" "}
							<strong className="font-bold">É ajudar você a fazer uma escolha sustentável</strong>{" "}
							para conquistar seu objetivo sem comprometer seu orçamento mensal.
						</p>
					</div>
					{/* Muda transparente sobre os raios navy (Figma 'Group 43'): sunburst radial branco,
					    centralizado atrás da muda, recortado no semicírculo superior (linha das moedas). */}
					<div className="relative mt-8 aspect-[59/32] w-full overflow-hidden">
						{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
						<img
							src={`${KV}/saude-financeira-burst.svg`}
							alt=""
							aria-hidden="true"
							className="pointer-events-none absolute bottom-[-14%] left-1/2 z-0 w-[150%] -translate-x-1/2 opacity-90"
						/>
						<Image
							src={`${KV}/image-5.png`}
							alt="Muda crescendo sobre moedas, símbolo de uma escolha financeira sustentável"
							fill
							sizes="100vw"
							className="relative z-10 object-contain"
						/>
					</div>
				</div>
			</div>

			{/* DESKTOP (≥lg) */}
			<div className="hidden lg:block">
				<KvContainer className="max-w-[1280px] py-20 md:py-28">
					{/* Painel coral: headline + subtítulo. Figma: banner 1234x242 (r:12), título
					    844px de largura quebrando em 2 linhas ("Como a AJA compara as melhores /
					    alternativas para você...."), padding topo ~37 / base ~11. */}
					<div className="rounded-[12px] bg-[#F2404F] px-8 py-10 md:px-14 md:pt-10 md:pb-6">
						<h2
							id="confianca-heading"
							className="max-w-[844px] text-[28px] font-normal leading-[1.2] text-[#FAFAF3] md:text-[44px] md:leading-[53px]"
						>
							Como a AJA{" "}
							<Em w="black" italic={false}>
								compara
							</Em>{" "}
							as melhores
							<br className="hidden md:block" /> alternativas para você....
						</h2>
						<p className="mt-3 max-w-[705px] text-[14px] leading-[22px] text-[#FFFFFF] md:text-[16px] md:leading-[26px]">
							Não basta comparar parcelas. Também avaliamos: taxa de administração, prazo, histórico
							de contemplação, lance médio, regras do grupo, condições da carta.
						</p>
					</div>

					{/* Faixa cream: carrossel horizontal dos 6 cards de critério. Figma recorta a
					    fileira numa janela ('Mask group' 817x356) de ~66% da largura da faixa,
					    alinhada à esquerda — só ~2,5 cards aparecem, o próximo espiando no corte
					    direito, deixando o terço direito livre pro regador pousar sem cobrir texto. */}
					<div className="mt-8 rounded-[12px] bg-[#F1F1DA] px-4 py-8 sm:px-6 md:mt-10 md:px-8 md:py-10">
						<div className="relative w-[66%] overflow-hidden">
							<div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#F1F1DA] to-transparent" />
							<CriteriosCarousel />
							<div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#F1F1DA] to-transparent" />
						</div>
					</div>

					{/* Faixa navy full-width: logo à esquerda, texto à direita. O painel recorta os
					    raios navy sutis (Group 43) numa camada interna overflow-hidden; a muda é um
					    overlay absoluto ancorado à base do painel, com o topo transbordando ~1/3 da
					    própria altura pra faixa bege acima (gesto-assinatura do Figma). */}
					<div className="relative mt-8 md:mt-10">
						<div className="relative flex flex-col gap-8 rounded-[12px] bg-[#021628] px-8 py-10 md:flex-row md:items-center md:gap-10 md:px-12 md:py-14">
							{/* Raios brancos sutis (mesmo SVG do mobile) atrás da muda, recortados
							    ao retângulo #021628: leque discreto, não dominante. */}
							<div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[12px]">
								{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
								<img
									src={`${KV}/saude-financeira-burst.svg`}
									alt=""
									aria-hidden="true"
									className="absolute bottom-[12%] left-[46%] w-[30%] -translate-x-1/2 opacity-50"
								/>
							</div>

							<Wordmark className="relative z-10 h-[58px] w-auto shrink-0 text-[#FAFAF3] md:order-1" />

							<div className="relative z-10 max-w-[368px] text-center md:order-3 md:ml-auto">
								<p className="text-[28px] leading-[36px] text-[#FAFAF3] md:text-[32px] md:leading-[38px]">
									Saúde financeira
								</p>
								<p className="mt-4 text-[15px] leading-[24px] text-[#FAFAF3] md:text-[16px] md:leading-[26px]">
									Nosso objetivo não é vender qualquer consórcio.{" "}
									<strong className="font-bold">
										É ajudar você a fazer uma escolha sustentável
									</strong>{" "}
									para conquistar seu objetivo sem comprometer seu orçamento.
								</p>
							</div>
						</div>

						{/* Muda: overlay absoluto com as moedas rentes à base da faixa navy (Figma:
						    image5 termina exatamente no rodapé do painel) e o topo transbordando pra
						    faixa bege acima (image5 começa 123px acima do topo navy). Centro ~45%
						    da largura, à esquerda do bloco de texto (que fica à direita). */}
						<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
							<div className="relative aspect-[575/365] w-[360px] -translate-x-[6%] md:w-[500px] lg:w-[600px]">
								<Image
									src={`${KV}/image-5.png`}
									alt="Muda crescendo sobre moedas, símbolo de uma escolha financeira sustentável"
									fill
									sizes="(min-width: 1024px) 600px, (min-width: 768px) 500px, 360px"
									className="object-contain"
								/>
							</div>
						</div>
					</div>

					{/* Regador coral (Figma 'image 4' 630×688 @999,0) — assinatura da seção: atravessa
					    o header vermelho e escorre sobre os cards, o jato terminando na transição
					    faixa bege → painel navy, apontando pra muda logo abaixo */}
					<Image
						src={`${KV}/image-4.png`}
						alt=""
						aria-hidden="true"
						width={512}
						height={512}
						className="pointer-events-none absolute top-[215px] right-8 z-30 h-auto w-[46%] max-w-[600px]"
					/>
				</KvContainer>
			</div>
		</section>
	);
}
