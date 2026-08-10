"use client";

import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
import { KvFaq } from "@/components/kv/kv-faq";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvMenu, NAV_VERTICAL } from "@/components/kv/kv-menu";
import { BlocoFormas } from "@/components/vertical/bloco-formas";
import { FaixaNumeros } from "@/components/vertical/faixa-numeros";
import { GuiaArtigos } from "@/components/vertical/guia-artigos";
import { HeroVertical } from "@/components/vertical/hero-vertical";

import { FAQ_IMOVEL, FGTS_IMOVEL, GUIA_IMOVEL, HERO_IMOVEL, NUMEROS_IMOVEL } from "./conteudo";

// Landing da vertical de imóvel (Figma 'Consórcios - imóvel' 625:4133). Primeira
// de uma família — auto, moto e serviços reaproveitam estas seções trocando só o
// conteúdo de `conteudo.ts`.
export default function ConsorcioImovelPage() {
	return (
		<TheaterProvider>
			<PaginaImovel />
			{/* Overlay "Modo Teatro" — morfa do elemento clicado sobre a landing desfocada. */}
			<ChatTheater />
		</TheaterProvider>
	);
}

function PaginaImovel() {
	const { openTheater } = useTheater();

	return (
		<main
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} flex min-h-screen flex-col bg-[var(--aja-paper)] font-sans text-[color:var(--aja-ink)] antialiased`}
		>
			<KvMenu onOpenChat={openTheater} nav={NAV_VERTICAL} />
			<div id="hero" className="scroll-mt-24">
				<HeroVertical conteudo={HERO_IMOVEL} onOpenChat={openTheater} />
			</div>
			<div id="proposito" className="scroll-mt-24">
				<FaixaNumeros conteudo={NUMEROS_IMOVEL} />
			</div>
			<div id="fgts" className="scroll-mt-24">
				<BlocoFormas conteudo={FGTS_IMOVEL} onOpenChat={openTheater} />
			</div>
			<div id="faq" className="scroll-mt-24">
				<KvFaq itens={FAQ_IMOVEL} />
			</div>
			<GuiaArtigos conteudo={GUIA_IMOVEL} />
			<KvFooter onOpenChat={openTheater} />
		</main>
	);
}
