import Image from "next/image";
import type { ComponentType, SVGProps } from "react";

import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

export type FaixaNumerosConteudo = {
	eyebrow: string;
	titulo: { inicio: string; enfase: string };
	/** Card "Quais imóveis?" — o que a carta de crédito cobre. */
	cobertura: {
		titulo: string;
		itens: string[];
		/**
		 * Arte 3D que transborda a borda esquerda do card (chaveiro em imóvel,
		 * chave do carro em auto). `proporcao` é a do PNG já aparado, `largura` a
		 * medida do comp e `sangria` o quanto ela sai para fora da borda.
		 */
		arte?: {
			src: string;
			alt: string;
			proporcao: string;
			largura: number;
			sangria: number;
		};
	};
	/** Número-síntese do setor (ex.: "2,83 milhões de brasileiros…"). */
	destaque: {
		/** Parte inteira e decimal separadas — no comp a vírgula e os decimais vêm em peso leve. */
		numero: { inteiro: string; decimal: string };
		unidade: string;
		descricao: string;
		/** Selo circular sobre o canto do card (a bandeira do Brasil, no comp). */
		selo: { src: string; alt: string };
	};
	/** Card das contemplações do ano, com a grade de pictogramas. */
	contemplacoes: {
		numero: string;
		unidade: string;
		/**
		 * Segmentos da legenda. `forte` marca o trecho em semibold; `quebra` força
		 * a linha a terminar ali — em imóvel o comp separa "contemplações" de
		 * "de imóveis" mesmo cabendo na mesma linha.
		 */
		descricao: { texto: string; forte?: boolean; quebra?: boolean }[];
		/**
		 * Glifo da grade — casinha em imóvel, carro em auto. É componente, e não
		 * `src`, porque a grade alterna coral e branco a 25% trocando a classe de
		 * cor: só funciona com `fill="currentColor"`, que um `<img>` não daria.
		 *
		 * Obrigatório de propósito: com default, a próxima vertical herdaria o
		 * glifo da anterior em silêncio.
		 */
		pictograma: ComponentType<SVGProps<SVGSVGElement>>;
		/** Total de pictogramas da grade e quais deles saem em coral. */
		total: number;
		destacados: number[];
	};
	/** Bloco largo "Como funciona a carta de crédito para imóveis?". */
	carta: {
		/** Ícone de linha ao lado do título (cédulas com selo, no comp). */
		icone: { src: string; alt: string };
		titulo: { inicio: string; enfase: string; fim: string };
		texto: { inicio: string; forte: string; fim: string };
		foto: { src: string; alt: string };
	};
	fonte: string;
};

// Faixa navy full-bleed das landings de vertical (Figma 625:4405): prova social do
// setor + o que a carta de crédito cobre, sobre fundo tinta.
//
// A decoração do fundo é de BORDA DURA — uma faixa vertical e dois arcos amplos
// em tinta mais clara. Antes eram círculos com `blur-[75px]`, que davam um
// degradê radial sem nada a ver com o comp: o desfoque some com a curva, e é a
// curva que se enxerga lá.
export function FaixaNumeros({ conteudo }: { conteudo: FaixaNumerosConteudo }) {
	return (
		<section className="relative overflow-hidden bg-[var(--aja-ink)]">
			{/* Decoração do fundo, exportada do Figma: uma forma só (faixa vertical que
			    curva pra esquerda), branco a 10%. O arquivo já traz a opacidade, e as
			    coordenadas internas dele posicionam a faixa onde o comp a coloca —
			    por isso vai colado no canto, em tamanho natural. */}
			{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
			<img
				src="/kv/fundo-faixa-numeros.svg"
				alt=""
				aria-hidden="true"
				className="pointer-events-none absolute left-0 top-0 h-[659px] w-[472px] max-w-none"
			/>
			{/* Mesma forma espelhada, fechando a curva pela direita. */}
			{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático, sem otimização do next/image necessária */}
			<img
				src="/kv/fundo-faixa-numeros.svg"
				alt=""
				aria-hidden="true"
				className="pointer-events-none absolute bottom-0 right-0 h-[659px] w-[472px] max-w-none -scale-100"
			/>

			{/* 1320 = 1256px de conteúdo, a largura da faixa no comp. Com 1280 a linha
			    de cards saía 3% mais estreita e a lista do primeiro card quebrava. */}
			<KvContainer className="max-w-[1320px] py-14 md:py-20">
				<div className="mx-auto flex max-w-[1023px] flex-col items-center gap-4 text-center">
					<KvEyebrow className="tracking-[0.18em]">{conteudo.eyebrow}</KvEyebrow>
					<h2 className="text-[32px] font-normal leading-[1.2] text-white md:text-[44px] md:leading-[62px]">
						{conteudo.titulo.inicio} <Em w="black">{conteudo.titulo.enfase}</Em>
					</h2>
				</div>

				{/* Proporção dos três cards vem do comp: 493 / 422 / 275 px em 1440. */}
				<div className="mt-12 grid gap-6 lg:grid-cols-[1.79fr_1.53fr_1fr]">
					{/* Card "Quais imóveis?" */}
					<div className="rounded-[12px] border-2 border-white p-8">
						<div className="flex items-center gap-4">
							{/* A `sangria` puxa a arte pra fora da borda esquerda do card, como
							    no comp, e é ela que devolve à lista o espaço de que precisa
							    pra não quebrar linha. */}
							{conteudo.cobertura.arte && (
								<div
									className="relative hidden shrink-0 lg:block"
									style={{
										aspectRatio: conteudo.cobertura.arte.proporcao,
										width: `${conteudo.cobertura.arte.largura}px`,
										marginLeft: `-${conteudo.cobertura.arte.sangria}px`,
									}}
								>
									<Image
										src={conteudo.cobertura.arte.src}
										alt={conteudo.cobertura.arte.alt}
										fill
										sizes={`${conteudo.cobertura.arte.largura}px`}
										className="object-contain"
									/>
								</div>
							)}

							<div className="min-w-0">
								<h3 className="text-[26px] font-normal leading-[1.2] text-[color:var(--aja-paper)] md:text-[32px] md:leading-[38px]">
									{conteudo.cobertura.titulo}
								</h3>
								<ul className="mt-6 flex flex-col gap-[15px]">
									{conteudo.cobertura.itens.map((item, i) => (
										<li
											key={item}
											className="flex items-start gap-2 text-[16px] font-light leading-[19px] tracking-[-0.02em] text-white"
										>
											{/* O tique alterna branco e coral descendo a lista. É ritmo visual,
											    não semântica: nenhum item vale mais que outro, e por isso a cor
											    sai do índice e não do conteúdo. */}
											<span
												aria-hidden="true"
												className={i % 2 === 1 ? "text-[color:var(--aja-coral)]" : "text-white"}
											>
												✓
											</span>
											{item}
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>

					{/* Card do número */}
					<div className="relative flex flex-col justify-center rounded-[12px] border-2 border-white bg-[var(--aja-paper)] px-6 pb-8 pt-10 text-center">
						<Image
							src={conteudo.destaque.selo.src}
							alt={conteudo.destaque.selo.alt}
							width={94}
							height={94}
							className="absolute -right-4 -top-8 size-[94px]"
						/>

						<p className="text-[color:var(--aja-coral)]">
							<span className="text-[88px] font-black leading-[1] tracking-[-0.02em] md:text-[128px]">
								{conteudo.destaque.numero.inteiro}
								<span className="font-light">,{conteudo.destaque.numero.decimal}</span>
							</span>
							<span className="-mt-2 block font-[family-name:var(--font-merriweather)] text-[28px] font-light leading-[1.2] tracking-[-0.02em] md:text-[36px]">
								{conteudo.destaque.unidade}
							</span>
						</p>
						<p className="mt-5 text-[16px] leading-[26px] text-[color:var(--aja-ink)]/85">
							{conteudo.destaque.descricao}
						</p>
					</div>

					{/* Card das contemplações */}
					<div className="flex flex-col items-center rounded-[12px] border-2 border-white px-6 py-8 text-center">
						<p className="text-[color:var(--aja-coral)]">
							<span className="text-[56px] font-black leading-[1] tracking-[-0.02em] md:text-[64px]">
								{conteudo.contemplacoes.numero}
							</span>{" "}
							<span className="text-[26px] font-light leading-[1]">
								{conteudo.contemplacoes.unidade}
							</span>
						</p>
						<p className="mt-2 text-[16px] leading-[22px] text-white">
							{conteudo.contemplacoes.descricao.map((parte) => (
								<span
									key={parte.texto}
									className={`${parte.forte ? "font-semibold" : ""} ${parte.quebra ? "block" : ""}`.trim()}
								>
									{parte.texto}
									{parte.quebra ? "" : " "}
								</span>
							))}
						</p>

						{/* Grade de pictogramas: parte em coral, como no comp. */}
						<div aria-hidden="true" className="mt-6 grid grid-cols-5 gap-2">
							{Array.from({ length: conteudo.contemplacoes.total }, (_, i) => (
								<conteudo.contemplacoes.pictograma
									// biome-ignore lint/suspicious/noArrayIndexKey: grade decorativa de tamanho fixo, sem identidade própria
									key={i}
									className={
										conteudo.contemplacoes.destacados.includes(i)
											? "h-6 w-auto text-[color:var(--aja-coral)]"
											: "h-6 w-auto text-white/25"
									}
								/>
							))}
						</div>
					</div>
				</div>

				{/* Bloco "Como funciona a carta de crédito" */}
				<div className="mt-6 grid overflow-hidden rounded-[12px] border-2 border-white lg:grid-cols-[1fr_460px]">
					<div className="p-8 md:p-10">
						<div className="flex items-start gap-5">
							{/* biome-ignore lint/performance/noImgElement: SVG decorativo estático; o next/image recusa SVG sem `dangerouslyAllowSVG`, e não há o que otimizar aqui */}
							<img
								src={conteudo.carta.icone.src}
								alt={conteudo.carta.icone.alt}
								width={67}
								height={70}
								aria-hidden="true"
								className="hidden h-[70px] w-auto shrink-0 md:block"
							/>
							<h3 className="text-[26px] font-normal leading-[1.2] text-white md:text-[32px] md:leading-[40px]">
								{conteudo.carta.titulo.inicio} <Em w="black">{conteudo.carta.titulo.enfase}</Em>{" "}
								{conteudo.carta.titulo.fim}
							</h3>
						</div>
						<p className="mt-6 max-w-[620px] text-[16px] font-light leading-[28px] text-white">
							{conteudo.carta.texto.inicio}{" "}
							<strong className="font-bold">{conteudo.carta.texto.forte}</strong>{" "}
							{conteudo.carta.texto.fim}
						</p>
					</div>

					<div className="relative min-h-[240px] lg:min-h-full">
						<Image
							src={conteudo.carta.foto.src}
							alt={conteudo.carta.foto.alt}
							fill
							sizes="(min-width: 1024px) 460px, 100vw"
							className="object-cover"
						/>
					</div>
				</div>

				<p className="mt-10 text-center text-[12px] font-light text-white/70">{conteudo.fonte}</p>
			</KvContainer>
		</section>
	);
}
