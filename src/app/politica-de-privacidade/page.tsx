"use client";

import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvMenu } from "@/components/kv/kv-menu";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

import { DESTAQUE_LGPD, HERO_POLITICA, SECOES_POLITICA } from "./conteudo";

// Página de Política de Privacidade (Figma 'politica-de-privacidade' 625:4545).
//
// Documento de texto corrido: sem seção reaproveitável do Key Visual no miolo,
// só cabeçalho e rodapé compartilhados. A largura útil é 1222px como no comp —
// `max-w-[1286px]` porque o `KvContainer` já come 64px de gutter no `md`.
export default function PoliticaDePrivacidadePage() {
	return (
		<TheaterProvider>
			<PaginaPolitica />
			{/* Overlay "Modo Teatro" — morfa do elemento clicado sobre a página desfocada. */}
			<ChatTheater />
		</TheaterProvider>
	);
}

function PaginaPolitica() {
	const { openTheater } = useTheater();

	return (
		<main
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} flex min-h-screen flex-col bg-[var(--aja-paper)] font-sans text-[color:var(--aja-ink)] antialiased`}
		>
			<KvMenu onOpenChat={openTheater} />

			<article className="pb-20 pt-16 md:pb-28 md:pt-20">
				<KvContainer className="max-w-[1286px]">
					<KvEyebrow className="tracking-[0.18em]">{HERO_POLITICA.eyebrow}</KvEyebrow>
					<h1 className="mt-4 text-[32px] font-bold leading-[1.15] text-[color:var(--aja-ink)] md:text-[44px]">
						{HERO_POLITICA.titulo}
					</h1>
					<p className="mt-5 max-w-[700px] text-[18px] leading-[1.6] text-[#2D2D2D]">
						{HERO_POLITICA.texto}
					</p>

					{/* Resumo em uma frase, destacado num card branco antes do texto
					    corrido: é o que a maioria vem conferir e sai. */}
					<aside className="mt-12 flex items-start gap-4 rounded-[16px] border border-[#EBEBE5] bg-white p-5 md:mt-14 md:gap-8 md:p-8">
						<span aria-hidden="true" className="shrink-0 text-[28px] leading-none">
							{DESTAQUE_LGPD.icone}
						</span>
						<div>
							<h2 className="text-[20px] font-bold leading-[1.3] text-[color:var(--aja-ink)]">
								{DESTAQUE_LGPD.titulo}
							</h2>
							<p className="mt-2 text-[15px] leading-[1.6] text-[#2D2D2D]">{DESTAQUE_LGPD.texto}</p>
						</div>
					</aside>

					{SECOES_POLITICA.map((secao) => (
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
				</KvContainer>
			</article>

			<KvFooter onOpenChat={openTheater} comCtaFinal={false} />
		</main>
	);
}
