"use client";

import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
import { KvFaq } from "@/components/kv/kv-faq";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvMenu, NAV_VERTICAL } from "@/components/kv/kv-menu";
import { BlocoUpgrade } from "@/components/vertical/bloco-upgrade";
import { FaixaNumeros } from "@/components/vertical/faixa-numeros";
// import { GuiaArtigos } from "@/components/vertical/guia-artigos";
import { HeroVertical } from "@/components/vertical/hero-vertical";

import { FAQ_AUTO, HERO_AUTO, NUMEROS_AUTO, UPGRADE_AUTO } from "./conteudo";

// Landing da vertical de carro (Figma 'Consórcios - auto' 625:3331). Segunda da
// família: reaproveita hero, faixa de números, FAQ e guia da vertical de imóvel,
// trocando só o conteúdo. A terceira seção é própria — onde imóvel fala de FGTS,
// que não vale para veículo, aqui entra o diagrama de upgrade.
export default function ConsorcioAutoPage() {
	return (
		<TheaterProvider>
			<PaginaAuto />
			{/* Overlay "Modo Teatro" — morfa do elemento clicado sobre a landing desfocada. */}
			<ChatTheater />
		</TheaterProvider>
	);
}

function PaginaAuto() {
	const { openTheater } = useTheater();

	return (
		<main
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} flex min-h-screen flex-col bg-[var(--aja-paper)] font-sans text-[color:var(--aja-ink)] antialiased`}
		>
			<KvMenu onOpenChat={openTheater} nav={NAV_VERTICAL} />
			<div id="hero" className="scroll-mt-24">
				<HeroVertical conteudo={HERO_AUTO} onOpenChat={openTheater} />
			</div>
			<div id="proposito" className="scroll-mt-24">
				<FaixaNumeros conteudo={NUMEROS_AUTO} />
			</div>
			<div id="upgrade" className="scroll-mt-24">
				<BlocoUpgrade conteudo={UPGRADE_AUTO} onOpenChat={openTheater} />
			</div>
			<div id="faq" className="scroll-mt-24">
				<KvFaq itens={FAQ_AUTO} />
			</div>
			{/* Guia de artigos fora do ar por ora — o blog ainda não existe e todos os
			    `href` do bloco apontam para "#". `GUIA_AUTO` segue exportado em
			    ./conteudo e coberto por verticais.test.ts; para repor, descomente aqui
			    e o import lá em cima. */}
			{/* <GuiaArtigos conteudo={GUIA_AUTO} /> */}
			<KvFooter onOpenChat={openTheater} />
		</main>
	);
}
