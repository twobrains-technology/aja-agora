"use client";

import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

export type BlocoFormasConteudo = {
	eyebrow: string;
	titulo: { inicio: string; enfase: string; fim: string };
	texto: string;
	/** Rótulo que fica ENTRE a grade de cards e o CTA — não acima dela. */
	formasEyebrow: string;
	formas: {
		/** "01".."04" — o comp numera as formas, não usa ícone de lista. */
		numero: string;
		titulo: string;
		descricao: string;
		/**
		 * Arte 3D que transborda o topo do card (martelo, calculadora, balança,
		 * cédulas). Opcional: sem ela o card fica correto, só sem ilustração.
		 *
		 * `ajuste` desloca em px sobre a âncora padrão (canto superior direito,
		 * mergulhando 32px no card). No comp nem toda arte fica no mesmo ponto —
		 * as cédulas, por exemplo, passam da borda direita e afundam mais.
		 */
		ilustracao?: { src: string; alt: string; ajuste?: { x?: number; y?: number } };
	}[];
	cta: string;
	/** Fala do cliente ao clicar no CTA — o teatro abre já no assunto da seção. */
	semente: string;
};

interface BlocoFormasProps {
	conteudo: BlocoFormasConteudo;
	onOpenChat: TheaterOpener;
}

// Bloco de "formas de…": eyebrow + título + texto, uma grade de cards numerados
// com arte transbordando o topo, e um rótulo + CTA embaixo.
//
// Não tem nada de FGTS dentro — o nome antigo (`bloco-fgts`) descrevia o único
// conteúdo que existia quando ele nasceu, na vertical de imóvel (Figma 625:4266
// + 625:4271). A forma serve a qualquer vertical.
export function BlocoFormas({ conteudo, onOpenChat }: BlocoFormasProps) {
	return (
		<section className="relative overflow-hidden bg-[var(--aja-paper)] py-16 md:py-24">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -left-[139px] top-0 size-[450px] rounded-full bg-[#FFE0E3] opacity-60 blur-[75px]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -right-[100px] bottom-0 size-[450px] rounded-full bg-[var(--aja-navy)] opacity-20 blur-[75px]"
			/>

			<KvContainer className="max-w-[1280px]">
				<div className="mx-auto flex max-w-[1091px] flex-col items-center gap-4 text-center">
					<KvEyebrow className="tracking-[0.18em]">{conteudo.eyebrow}</KvEyebrow>
					<h2 className="text-[32px] font-normal leading-[1.2] text-[color:var(--aja-ink)] md:text-[44px] md:leading-[62px]">
						{conteudo.titulo.inicio} <Em w="black">{conteudo.titulo.enfase}</Em>{" "}
						{conteudo.titulo.fim}
					</h2>
					<p className="max-w-[744px] text-[16px] leading-[26px] text-[color:var(--aja-stone)]">
						{conteudo.texto}
					</p>
				</div>

				{/* Margem de topo generosa: a arte de cada card sobe acima da borda. */}
				<ul className="mt-20 grid gap-6 sm:grid-cols-2 md:mt-28 lg:grid-cols-4">
					{conteudo.formas.map((forma) => (
						<li
							key={forma.numero}
							className="relative rounded-[12px] bg-[var(--aja-cream)] px-7 pb-9 pt-8"
						>
							{/* Ancorado pela BASE: `bottom-full` encosta a arte no topo do card e
							    o `translate-y` a empurra 32px pra dentro, como no comp. Assim as
							    quatro invadem o card igual, mesmo tendo alturas diferentes —
							    uma caixa de altura fixa desalinharia todas menos uma.
							    Os PNGs já vêm do Figma no tamanho de exibição e foram aparados,
							    então vão em tamanho natural, sem `next/image`: não há o que
							    otimizar em 5 KB, e o redimensionamento do otimizador
							    atrapalharia o alinhamento. */}
							{forma.ilustracao && (
								// biome-ignore lint/performance/noImgElement: arte decorativa de ~5 KB, exibida no tamanho natural
								<img
									src={forma.ilustracao.src}
									alt={forma.ilustracao.alt}
									aria-hidden="true"
									className="pointer-events-none absolute bottom-full right-0"
									style={{
										transform: `translate(${forma.ilustracao.ajuste?.x ?? 0}px, ${32 + (forma.ilustracao.ajuste?.y ?? 0)}px)`,
									}}
								/>
							)}

							<span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-[color:var(--aja-coral)] px-3 text-[14px] font-bold leading-none text-white">
								{forma.numero}
							</span>
							<h3 className="mt-6 text-[20px] font-bold leading-[1.25] text-[color:var(--aja-ink)]">
								{forma.titulo}
							</h3>
							<p className="mt-3 text-[15px] leading-[24px] text-[color:var(--aja-stone)]">
								{forma.descricao}
							</p>
						</li>
					))}
				</ul>

				<div className="mt-14 flex flex-col items-center gap-6">
					<KvEyebrow className="tracking-[0.18em]">{conteudo.formasEyebrow}</KvEyebrow>
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
