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
 * Geometria do diagrama a partir de `lg`, medida no comp (frame de 1440).
 *
 * O x vai em %, para acompanhar a largura; o y em px, porque a altura do
 * diagrama é fixa em 620px — é uma composição, não um fluxo. Abaixo de `lg`
 * nada disso vale: os três viram uma lista e o carro sobe para o topo.
 */
const POSICAO = [
	{ texto: "lg:left-[31.6%] lg:top-[35px]", selo: "lg:left-[24.5%] lg:top-[58px]" },
	{ texto: "lg:left-[60.8%] lg:top-[145px]", selo: "lg:left-[54.4%] lg:top-[168px]" },
	{
		texto: "lg:left-[38%] lg:top-[500px] lg:w-[28%] lg:text-center",
		selo: "lg:left-[44.3%] lg:top-[388px]",
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
				<div className="mx-auto flex max-w-[1091px] flex-col items-center gap-4 px-6 text-center md:px-8">
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
				<div className="relative mt-10 px-6 md:px-8 lg:mt-8 lg:h-[620px] lg:px-0">
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
								className="pointer-events-none absolute left-[19.6%] top-[17px] hidden w-[28.5%] rotate-180 lg:block"
							/>
							{/* biome-ignore lint/performance/noImgElement: decoração estática, sem redimensionamento */}
							<img
								src={conteudo.fita.src}
								alt=""
								aria-hidden="true"
								className="pointer-events-none absolute left-[48%] top-[277px] hidden w-[28.5%] lg:block"
							/>
						</>
					)}

					{conteudo.veiculo && (
						// biome-ignore lint/performance/noImgElement: arte central do diagrama
						<img
							src={conteudo.veiculo.src}
							alt={conteudo.veiculo.alt}
							// 36% = 518px e o arquivo é 2:1, logo 259px de altura. O topo vem do
							// comp: teto do carro em y=418 da seção, ou seja 168 deste contêiner
							// — é isso que faz o selo do contrato encostar no teto, como lá.
							className="mx-auto w-full max-w-[420px] lg:pointer-events-none lg:absolute lg:left-[29.5%] lg:top-[168px] lg:mx-0 lg:w-[36%] lg:max-w-none"
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
										className={`size-[94px] shrink-0 rounded-full shadow-[0_4px_16px_0_#00000014] lg:absolute ${POSICAO[i]?.selo ?? ""}`}
									/>
								)}

								<div className={`mt-3 lg:absolute lg:mt-0 ${POSICAO[i]?.texto ?? ""}`}>
									<p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.18em] text-[color:var(--aja-coral)]">
										{grupo.rotulo}
									</p>
									<ul className="mt-2 flex flex-col gap-1">
										{grupo.itens.map((item) => (
											<li
												key={item}
												className="text-[15px] leading-[24px] text-[color:var(--aja-ink)]/85"
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
