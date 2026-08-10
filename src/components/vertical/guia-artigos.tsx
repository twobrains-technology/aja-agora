import Image from "next/image";

import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

export type GuiaArtigosConteudo = {
	eyebrow: string;
	/**
	 * `enfase` é opcional porque varia por vertical: o comp de imóvel põe
	 * "planejar melhor." em Merriweather itálico e o de auto deixa o título
	 * inteiro em Poppins.
	 */
	titulo: { inicio: string; enfase?: string };
	texto: string;
	/** Rótulo do link de cada card — igual nos três, então mora aqui. */
	chamadaArtigo: string;
	artigos: {
		href: string;
		capa: { src: string; alt: string };
		tags: string[];
		titulo: string;
		resumo: string;
	}[];
};

// Seção "Guia para consórcio" (Figma 625:4133): três artigos editoriais sobre a
// vertical, cada um com capa, tags, chamada e link. As diagonais coral da direita
// são as mesmas do hero — decoração, saem do fluxo em telas pequenas.
export function GuiaArtigos({ conteudo }: { conteudo: GuiaArtigosConteudo }) {
	return (
		<section className="relative overflow-hidden bg-[var(--aja-paper)] py-16 md:py-24">
			{/* Chevron coral do comp, colado na borda direita. É UMA peça com o vértice
			    apontando pra esquerda e os dois braços saindo pela direita — não duas
			    faixas soltas, que foi como eu tinha reconstruído no olho.
			    Veio em JPG sobre branco (sem alfa), então entra em `mix-blend-multiply`:
			    o branco não altera o papel da seção e só o coral pinta. */}
			{/* biome-ignore lint/performance/noImgElement: decoração estática, exibida no tamanho do comp */}
			<img
				src="/kv/fundo-guia-chevron.jpg"
				alt=""
				aria-hidden="true"
				className="pointer-events-none absolute right-0 top-[151px] hidden h-[696px] w-auto max-w-none mix-blend-multiply lg:block"
			/>

			<KvContainer className="max-w-[1280px]">
				<div className="mx-auto flex max-w-[1091px] flex-col items-center gap-4 text-center">
					<KvEyebrow className="tracking-[0.18em]">{conteudo.eyebrow}</KvEyebrow>
					<h2 className="text-[32px] font-normal leading-[1.2] text-[color:var(--aja-ink)] md:text-[44px] md:leading-[62px]">
						{conteudo.titulo.inicio}
						{conteudo.titulo.enfase && (
							<>
								{" "}
								<Em w="black">{conteudo.titulo.enfase}</Em>
							</>
						)}
					</h2>
					{/* 1120px: no comp o subtítulo cabe em UMA linha a 1440 de viewport. */}
					<p className="max-w-[1120px] text-[16px] leading-[26px] text-[color:var(--aja-stone)]">
						{conteudo.texto}
					</p>
				</div>

				<ul className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{conteudo.artigos.map((artigo) => (
						<li
							key={artigo.titulo}
							className="flex flex-col overflow-hidden rounded-[12px] bg-[var(--aja-cream)]"
						>
							<div className="relative aspect-[393/204] w-full">
								<Image
									src={artigo.capa.src}
									alt={artigo.capa.alt}
									fill
									sizes="(min-width: 1024px) 358px, (min-width: 768px) 50vw, 100vw"
									className="object-cover"
								/>
							</div>

							<div className="flex flex-1 flex-col p-6">
								<ul className="flex flex-wrap gap-2">
									{artigo.tags.map((tag) => (
										<li
											key={tag}
											className="rounded-full border border-[color:var(--aja-ink)] px-3 py-1 text-[12px] font-semibold leading-4 text-[color:var(--aja-ink)]"
										>
											{tag}
										</li>
									))}
								</ul>

								<h3 className="mt-5 text-[22px] font-bold leading-[1.25] tracking-[-0.01em] text-[color:var(--aja-ink)]">
									{artigo.titulo}
								</h3>
								<p className="mt-3 text-[15px] leading-[24px] text-[color:var(--aja-stone)]">
									{artigo.resumo}
								</p>

								{/* `mt-auto` alinha o link no rodapé mesmo com resumos de alturas diferentes. */}
								<a
									href={artigo.href}
									className="mt-auto pt-6 text-[15px] font-bold text-[color:var(--aja-coral)] underline underline-offset-4 transition-opacity hover:opacity-75"
								>
									{conteudo.chamadaArtigo} ›
								</a>
							</div>
						</li>
					))}
				</ul>
			</KvContainer>
		</section>
	);
}
