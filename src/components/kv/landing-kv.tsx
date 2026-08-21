"use client";

import { ChatFlutuante } from "@/components/chat/chat-flutuante";
import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { HeatmapTracker } from "@/components/heatmap/heatmap-tracker";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
import { HERO_CONSULTIVO, type HeroConteudo } from "@/components/kv/heros";
import { KvComparacao } from "@/components/kv/kv-comparacao";
import { KvConfianca } from "@/components/kv/kv-confianca";
import { KvContemplacao } from "@/components/kv/kv-contemplacao";
import { KvDepoimentos } from "@/components/kv/kv-depoimentos";
import { KvFaq } from "@/components/kv/kv-faq";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvHero } from "@/components/kv/kv-hero";
import { KvJourney } from "@/components/kv/kv-journey";
import { KvMenu } from "@/components/kv/kv-menu";
import { KvNumbers } from "@/components/kv/kv-numbers";
import { KvTipos } from "@/components/kv/kv-tipos";

interface LandingKvProps {
	/** O texto do topo. Sem prop, é o que está em produção. */
	hero?: HeroConteudo;
	/**
	 * O `path` que o mapa de calor grava. Fica de fora do registro de variantes
	 * porque é decisão de MEDIÇÃO, não de conteúdo — e todas as variantes gravam
	 * `/`, porque é o que o visitante terá na barra de endereços quando o proxy
	 * estiver reescrevendo. A allowlist `SECOES_POR_LANDING` também é indexada
	 * por path: gravar `/direto` faria o servidor recusar toda seção calado.
	 */
	heatPath?: string;
}

/**
 * A home, inteira. Parametrizada pelo texto do hero porque existem VARIANTES em
 * teste A/B (`heros.tsx`) — e porque duplicar a landing para trocar três frases
 * é como as duas cópias começam a divergir.
 */
export function LandingKv({ hero = HERO_CONSULTIVO, heatPath = "/" }: LandingKvProps) {
	return (
		<TheaterProvider>
			<LandingShell hero={hero} heatPath={heatPath} />
			{/* Overlay "Modo Teatro" — morfa do elemento clicado sobre a landing desfocada. */}
			<ChatTheater />
			{/* Botão flutuante do chat, parado no canto da tela durante toda a rolagem
			    (só no mobile). Fica FORA do <main> e ao lado do teatro de propósito:
			    é cromo da janela, não conteúdo de seção. */}
			<ChatFlutuante />
		</TheaterProvider>
	);
}

function LandingShell({ hero, heatPath }: Required<LandingKvProps>) {
	const { openTheater } = useTheater();

	return (
		<main
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} flex min-h-screen flex-col bg-[#FAFAF3] font-sans text-[#021628] antialiased`}
		>
			{/* `data-heat` marca a seção para o mapa de calor. Os nomes têm que bater
			    com `SECOES_POR_LANDING["/"]` (`src/lib/heatmap/events.ts`): o
			    servidor recusa seção fora da allowlist, então nome errado some do
			    painel em silêncio. */}
			<div data-heat="kv-menu">
				<KvMenu onOpenChat={openTheater} />
			</div>
			<div id="hero" data-heat="kv-hero" className="scroll-mt-24">
				<KvHero onOpenChat={openTheater} conteudo={hero} />
			</div>
			<div id="como-funciona" data-heat="kv-journey" className="scroll-mt-24">
				<KvJourney />
			</div>
			{/* O `id` é o destino do "Tipo de Consórcio" do rodapé, que aparece
			    também nas verticais e por isso aponta para `/#tipos`. */}
			<div id="tipos" data-heat="kv-tipos" className="scroll-mt-24">
				<KvTipos onOpenChat={openTheater} />
			</div>
			<div data-heat="kv-contemplacao">
				<KvContemplacao />
			</div>
			<div id="faq" data-heat="kv-faq" className="scroll-mt-24">
				<KvFaq />
			</div>
			<div data-heat="kv-numbers">
				<KvNumbers />
			</div>
			<div data-heat="kv-depoimentos">
				<KvDepoimentos onOpenChat={openTheater} />
			</div>
			<div id="confianca" data-heat="kv-confianca" className="scroll-mt-24">
				<KvConfianca />
			</div>
			<div data-heat="kv-comparacao">
				<KvComparacao />
			</div>
			<div data-heat="kv-footer">
				<KvFooter onOpenChat={openTheater} />
			</div>
			<HeatmapTracker path={heatPath} />
		</main>
	);
}
