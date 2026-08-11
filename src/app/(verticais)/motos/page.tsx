"use client";

import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
import { KvFaq } from "@/components/kv/kv-faq";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvMenu, NAV_VERTICAL } from "@/components/kv/kv-menu";
import { BlocoPassos } from "@/components/vertical/bloco-passos";
import { FaixaNumeros } from "@/components/vertical/faixa-numeros";
import { GuiaArtigos } from "@/components/vertical/guia-artigos";
import { HeroVertical } from "@/components/vertical/hero-vertical";

import { FAQ_MOTO, GUIA_MOTO, HERO_MOTO, NUMEROS_MOTO, PASSOS_MOTO } from "./conteudo";

// Landing da vertical de moto (Figma 'Consórcios - moto' 625:3679). Terceira da
// família: reaproveita hero, faixa de números, FAQ e guia das outras duas,
// trocando só o conteúdo. A terceira seção é própria de cada vertical — em
// imóvel é o FGTS, em auto o diagrama de upgrade, e aqui a jornada em três
// passos de quem tira o sustento da moto.
export default function ConsorcioMotoPage() {
	return (
		<TheaterProvider>
			<PaginaMoto />
			{/* Overlay "Modo Teatro" — morfa do elemento clicado sobre a landing desfocada. */}
			<ChatTheater />
		</TheaterProvider>
	);
}

function PaginaMoto() {
	const { openTheater } = useTheater();

	return (
		<main
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} flex min-h-screen flex-col bg-[var(--aja-paper)] font-sans text-[color:var(--aja-ink)] antialiased`}
		>
			<KvMenu onOpenChat={openTheater} nav={NAV_VERTICAL} />
			<div id="hero" className="scroll-mt-24">
				<HeroVertical conteudo={HERO_MOTO} onOpenChat={openTheater} />
			</div>
			<div id="proposito" className="scroll-mt-24">
				<FaixaNumeros conteudo={NUMEROS_MOTO} />
			</div>
			<div id="trabalho" className="scroll-mt-24">
				<BlocoPassos conteudo={PASSOS_MOTO} onOpenChat={openTheater} />
			</div>
			<div id="faq" className="scroll-mt-24">
				<KvFaq itens={FAQ_MOTO} />
			</div>
			<GuiaArtigos conteudo={GUIA_MOTO} />
			<KvFooter onOpenChat={openTheater} />
		</main>
	);
}
