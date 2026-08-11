import type { ReactNode } from "react";

import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

/**
 * O corpo de um documento jurídico do site — título, resumo e seções numeradas.
 *
 * Nasceu quando os Termos de Uso chegaram e teriam sido a segunda cópia do
 * mesmo JSX da Política de Privacidade. Documento jurídico é justamente o tipo
 * de página onde a cópia apodrece sem ninguém ver: o jurídico revisa o texto,
 * não o layout, e as duas páginas iam divergindo de espaçamento e de marcação
 * a cada retoque.
 *
 * O que ele NÃO faz é cabeçalho e rodapé: cada página monta os seus, porque é
 * ali que mora a decisão de mostrar ou não o CTA final.
 */

export type SecaoLegal = {
	titulo: string;
	/** Parágrafos corridos, na ordem. */
	paragrafos: string[];
	/** Itens de lista, quando a seção enumera. Vêm depois dos parágrafos. */
	itens?: string[];
};

export type HeroLegal = {
	eyebrow: string;
	titulo: string;
	texto: string;
};

/** Resumo em uma frase, destacado antes do texto corrido. */
export type DestaqueLegal = {
	icone: string;
	titulo: string;
	texto: string;
};

interface DocumentoLegalProps {
	hero: HeroLegal;
	secoes: SecaoLegal[];
	destaque?: DestaqueLegal;
	/** Data de vigência, por extenso. Documento sem data não se sabe qual versão foi aceita. */
	atualizadoEm?: string;
	children?: ReactNode;
}

export function DocumentoLegal({
	hero,
	secoes,
	destaque,
	atualizadoEm,
	children,
}: DocumentoLegalProps) {
	return (
		<article className="pb-20 pt-16 md:pb-28 md:pt-20">
			{/* Largura útil de 1222px como no comp — `max-w-[1286px]` porque o
			    `KvContainer` já come 64px de gutter no `md`. */}
			<KvContainer className="max-w-[1286px]">
				<KvEyebrow className="tracking-[0.18em]">{hero.eyebrow}</KvEyebrow>
				<h1 className="mt-4 text-[32px] font-bold leading-[1.15] text-[color:var(--aja-ink)] md:text-[44px]">
					{hero.titulo}
				</h1>
				<p className="mt-5 max-w-[700px] text-[18px] leading-[1.6] text-[#2D2D2D]">{hero.texto}</p>

				{atualizadoEm ? (
					<p className="mt-4 text-[14px] leading-[1.6] text-[var(--aja-stone)]">
						Última atualização: {atualizadoEm}
					</p>
				) : null}

				{destaque ? (
					<aside className="mt-12 flex items-start gap-4 rounded-[16px] border border-[#EBEBE5] bg-white p-5 md:mt-14 md:gap-8 md:p-8">
						<span aria-hidden="true" className="shrink-0 text-[28px] leading-none">
							{destaque.icone}
						</span>
						<div>
							<h2 className="text-[20px] font-bold leading-[1.3] text-[color:var(--aja-ink)]">
								{destaque.titulo}
							</h2>
							<p className="mt-2 text-[15px] leading-[1.6] text-[#2D2D2D]">{destaque.texto}</p>
						</div>
					</aside>
				) : null}

				{secoes.map((secao) => (
					<section key={secao.titulo} className="mt-12 md:mt-14">
						<h2 className="text-[22px] font-semibold leading-[1.3] text-[color:var(--aja-ink)] md:text-[24px]">
							{secao.titulo}
						</h2>
						{secao.paragrafos.map((paragrafo) => (
							<p key={paragrafo} className="mt-4 text-[16px] leading-[1.75] text-[#2D2D2D]">
								{paragrafo}
							</p>
						))}
						{/* Lista de verdade, e não o "•" que o comp digita dentro do
						    parágrafo: num documento que enumera direitos do titular, o
						    leitor de tela precisa anunciar quantos itens são. */}
						{secao.itens ? (
							<ul className="mt-4 flex flex-col gap-2">
								{secao.itens.map((item) => (
									<li
										key={item}
										className="relative pl-6 text-[16px] leading-[1.75] text-[#2D2D2D] before:absolute before:left-1 before:text-[color:var(--aja-coral)] before:content-['•']"
									>
										{item}
									</li>
								))}
							</ul>
						) : null}
					</section>
				))}

				{children}
			</KvContainer>
		</article>
	);
}
