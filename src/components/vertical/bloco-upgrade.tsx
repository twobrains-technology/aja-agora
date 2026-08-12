"use client";

import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

export type BlocoUpgradeConteudo = {
	eyebrow: string;
	titulo: { inicio: string; enfase: string };
	texto: { inicio: string; forte: string; fim: string };
	/** Arte central do diagrama (o carro), com fundo transparente. */
	veiculo?: { src: string; alt: string };
	/** Fita coral em "S" que envolve a composição. Puramente decorativa. */
	fita?: { src: string; alt: string };
	/**
	 * Os três momentos da jornada, na ordem em que aparecem no comp: o que dói
	 * hoje, o que o consórcio muda, e como fica depois.
	 */
	grupos: {
		rotulo: string;
		/** Arte dentro do selo circular branco (bomba, contrato, bateria). */
		icone?: { src: string; alt: string };
		itens: string[];
	}[];
	cta: string;
	/** Fala do cliente ao clicar no CTA — o teatro abre já no assunto da troca. */
	semente: string;
};

interface BlocoUpgradeProps {
	conteudo: BlocoUpgradeConteudo;
	onOpenChat: TheaterOpener;
}

/**
 * Geometria do diagrama a partir de `lg`, em px dentro do palco de 878x615 —
 * as medidas são as do comp, lidas direto do grupo do diagrama.
 *
 * Era tudo em % antes, o que parecia mais flexível e na prática desalinhava:
 * as porcentagens tinham sido tiradas do frame de 1440 do Figma, mas resolvem
 * contra o contêiner, que mede 1376. Cada peça escorregava um tanto diferente
 * — o selo de HOJE ia 21px pra direita, o texto de A TROCA 25px pra esquerda —
 * e o diagrama saía torto. Com o palco em largura fixa, x e y são os do comp e
 * não dependem mais da janela. Abaixo de `lg` nada disso vale: os três viram
 * uma lista e o carro sobe para o topo.
 */
const POSICAO = [
	{ selo: "lg:left-[66px] lg:top-[34px]", texto: "lg:left-[180px] lg:top-[22px] lg:w-[246px]" },
	// A TROCA sobe 24px em relação ao comp (selo 148→124, texto 134→110). No comp
	// o capô do carro passa por cima de "O carro sai no seu nome" — invade 17px na
	// última linha —, e o selo acompanha o texto pra não descolar do bloco.
	{ selo: "lg:left-[496px] lg:top-[124px]", texto: "lg:left-[612px] lg:top-[110px] lg:w-[266px]" },
	{
		selo: "lg:left-[353px] lg:top-[368px]",
		texto: "lg:left-[221px] lg:top-[496px] lg:w-[364px] lg:text-center",
	},
];

// Bloco "A hora de dar um upgrade" (Figma 'Consórcios - auto' 625:3331): diagrama
// HOJE → A TROCA → DEPOIS em volta do veículo, envolvido por uma fita coral.
//
// Não existe equivalente na vertical de imóvel — é a única seção do comp de auto
// sem contraparte, por isso componente próprio em vez de reúso do `BlocoFormas`.
export function BlocoUpgrade({ conteudo, onOpenChat }: BlocoUpgradeProps) {
	return (
		<section className="relative overflow-hidden bg-[var(--aja-paper)] py-16 md:py-24">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -left-[139px] top-0 size-[450px] rounded-full bg-[#FFE0E3] opacity-60 blur-[75px]"
			/>

			<KvContainer className="max-w-[1440px] px-0">
				<div className="mx-auto flex max-w-[1091px] flex-col items-center gap-2 px-6 text-center md:px-8">
					<KvEyebrow className="tracking-[0.18em]">{conteudo.eyebrow}</KvEyebrow>
					<h2 className="text-[32px] font-normal leading-[1.2] text-[color:var(--aja-ink)] md:text-[44px] md:leading-[62px]">
						{conteudo.titulo.inicio} <Em w="black">{conteudo.titulo.enfase}</Em>
					</h2>
					<p className="max-w-[880px] text-[16px] leading-[26px] text-[color:var(--aja-stone)]">
						{conteudo.texto.inicio}{" "}
						<strong className="font-semibold text-[color:var(--aja-ink)]">
							{conteudo.texto.forte}
						</strong>{" "}
						{conteudo.texto.fim}
					</p>
				</div>

				{/* O diagrama. Altura fixa a partir de `lg` porque as peças são
				    posicionadas umas em relação às outras, não empilhadas. */}
				<div className="relative mt-10 px-6 md:px-8 lg:mx-auto lg:mt-10 lg:h-[615px] lg:w-[878px] lg:px-0">
					{/* A fita é UMA peça usada DUAS vezes: girada 180° ela vira o arco de
					    cima (ponta apontando pra cima e à esquerda), e no natural o de
					    baixo. O carro e os selos entram depois no DOM, então ficam por
					    cima — a oclusão é ordem de camada, não recorte na imagem. */}
					{conteudo.fita && (
						<>
							{/* biome-ignore lint/performance/noImgElement: decoração estática, sem redimensionamento */}
							<img
								src={conteudo.fita.src}
								alt=""
								aria-hidden="true"
								className="pointer-events-none absolute left-0 top-0 hidden w-[411px] rotate-180 lg:block"
							/>
							{/* biome-ignore lint/performance/noImgElement: decoração estática, sem redimensionamento */}
							<img
								src={conteudo.fita.src}
								alt=""
								aria-hidden="true"
								className="pointer-events-none absolute left-[411px] top-[249px] hidden w-[411px] lg:block"
							/>
						</>
					)}

					{conteudo.veiculo && (
						// biome-ignore lint/performance/noImgElement: arte central do diagrama
						<img
							src={conteudo.veiculo.src}
							alt={conteudo.veiculo.alt}
							// No comp a moldura do carro é 526x294 em 148,135. O arquivo é 2:1,
							// então a 526px de largura ele dá 263 de altura e assenta no meio
							// dessa moldura — daí o topo em 150, e não em 135.
							className="mx-auto w-full max-w-[420px] lg:pointer-events-none lg:absolute lg:left-[148px] lg:top-[150px] lg:mx-0 lg:w-[526px] lg:max-w-none"
						/>
					)}

					<ul className="mt-10 flex flex-col gap-10 lg:mt-0 lg:block">
						{conteudo.grupos.map((grupo, i) => (
							<li key={grupo.rotulo} className="lg:contents">
								{grupo.icone && (
									// biome-ignore lint/performance/noImgElement: selo de poucos KB, exibido no tamanho do comp
									<img
										src={grupo.icone.src}
										alt=""
										aria-hidden="true"
										// O recorte já traz o disco branco; o `rounded-full` apara os
										// cantos, onde sobra fundo da seção.
										className={`size-[94px] shrink-0 rounded-full shadow-[0_4px_16px_0_#00000014] lg:absolute lg:size-[100px] ${POSICAO[i]?.selo ?? ""}`}
									/>
								)}

								<div className={`mt-3 lg:absolute lg:mt-0 ${POSICAO[i]?.texto ?? ""}`}>
									<p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.18em] text-[color:var(--aja-coral)]">
										{grupo.rotulo}
									</p>
									{/* Sem `gap`: no comp os quatro itens são um bloco de texto só, quatro
									    linhas seguidas de 22px. Os 4px que havia entre eles engordavam o
									    bloco em 20px e desencontravam o texto do selo ao lado. */}
									<ul className="mt-1 flex flex-col">
										{grupo.itens.map((item) => (
											<li
												key={item}
												className="text-[14px] leading-[22px] text-[color:var(--aja-ink)]/85"
											>
												• {item}
											</li>
										))}
									</ul>
								</div>
							</li>
						))}
					</ul>
				</div>

				<div className="mt-14 flex justify-center px-6 md:px-8">
					<KvCtaButton
						variant="outline"
						// O rótulo é longo ("Quero comparar as melhores alternativas") e o átomo
						// tem `whitespace-nowrap`: com o `px-8` dele sobravam 261px de caixa
						// para 270px de texto em 375px, e a frase era cortada. Respiro e fonte
						// menores no celular; do `md` em diante vale o tamanho do sistema.
						className="h-12 w-full max-w-[516px] px-4 text-[14px] md:h-[52px] md:px-8 md:text-[16px]"
						onClick={(e) => onOpenChat(conteudo.semente, e.currentTarget, "chip")}
					>
						{conteudo.cta}
					</KvCtaButton>
				</div>
			</KvContainer>
		</section>
	);
}
