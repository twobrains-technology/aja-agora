"use client";

import { ChatFlutuante } from "@/components/chat/chat-flutuante";
import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { HeatmapTracker } from "@/components/heatmap/heatmap-tracker";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
import { KvFaq } from "@/components/kv/kv-faq";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvMenu, NAV_VERTICAL } from "@/components/kv/kv-menu";
import { BlocoPassos } from "@/components/vertical/bloco-passos";
import { FaixaNumeros } from "@/components/vertical/faixa-numeros";
// import { GuiaArtigos } from "@/components/vertical/guia-artigos";
import { HeroVertical } from "@/components/vertical/hero-vertical";
import { SementeDeCampanha } from "@/components/vertical/semente-de-campanha";

import { FAQ_MOTO, HERO_MOTO, NUMEROS_MOTO, PASSOS_MOTO } from "./conteudo";

// Landing da vertical de moto (Figma 'Consórcios - moto' 625:3679). Terceira da
// família: reaproveita hero, faixa de números, FAQ e guia das outras duas,
// trocando só o conteúdo. A terceira seção é própria de cada vertical — em
// imóvel é o FGTS, em auto o diagrama de upgrade, e aqui a jornada em três
// passos de quem tira o sustento da moto.
export default function ConsorcioMotoPage() {
	return (
		<TheaterProvider>
			{/* Chegada de anúncio de catálogo (`?bem=50000`): abre a conversa já
			    com o valor da carta que o card prometeu. */}
			<SementeDeCampanha semente={HERO_MOTO.sementeDeValor} />
			<PaginaMoto />
			{/* Overlay "Modo Teatro" — morfa do elemento clicado sobre a landing desfocada. */}
			<ChatTheater />
			{/* Botão flutuante do chat, parado no canto da tela durante toda a rolagem
			    (só no mobile). Fica FORA do <main> e ao lado do teatro de propósito:
			    é cromo da janela, não conteúdo de seção. */}
			<ChatFlutuante />
		</TheaterProvider>
	);
}

function PaginaMoto() {
	const { openTheater } = useTheater();

	return (
		<main
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} flex min-h-screen flex-col bg-[var(--aja-paper)] font-sans text-[color:var(--aja-ink)] antialiased`}
		>
			<div data-heat="kv-menu">
				<KvMenu onOpenChat={openTheater} nav={NAV_VERTICAL} />
			</div>
			<div id="hero" data-heat="hero-vertical" className="scroll-mt-24">
				<HeroVertical conteudo={HERO_MOTO} onOpenChat={openTheater} />
			</div>
			<div id="proposito" data-heat="faixa-numeros" className="scroll-mt-24">
				<FaixaNumeros conteudo={NUMEROS_MOTO} />
			</div>
			<div id="trabalho" data-heat="bloco-passos" className="scroll-mt-24">
				<BlocoPassos conteudo={PASSOS_MOTO} onOpenChat={openTheater} />
			</div>
			<div id="faq" data-heat="kv-faq" className="scroll-mt-24">
				<KvFaq itens={FAQ_MOTO} />
			</div>
			{/* Guia de artigos fora do ar por ora — o blog ainda não existe e todos os
			    `href` do bloco apontam para "#". `GUIA_MOTO` segue exportado em
			    ./conteudo e coberto por verticais.test.ts; para repor, descomente aqui
			    e o import lá em cima. */}
			{/* <GuiaArtigos conteudo={GUIA_MOTO} /> */}
			<div data-heat="kv-footer">
				<KvFooter onOpenChat={openTheater} />
			</div>
			<HeatmapTracker path="/motos" />
		</main>
	);
}
