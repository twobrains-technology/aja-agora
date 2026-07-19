"use client";

import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
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

export default function LandingPage() {
	return (
		<TheaterProvider>
			<LandingShell />
			{/* Overlay "Modo Teatro" — morfa do elemento clicado sobre a landing desfocada. */}
			<ChatTheater />
		</TheaterProvider>
	);
}

function LandingShell() {
	const { openTheater } = useTheater();

	return (
		<main
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} flex min-h-screen flex-col bg-[#FAFAF3] font-sans text-[#021628] antialiased`}
		>
			<KvMenu onOpenChat={openTheater} />
			<div id="hero" className="scroll-mt-24">
				<KvHero onOpenChat={openTheater} />
			</div>
			<div id="como-funciona" className="scroll-mt-24">
				<KvJourney />
			</div>
			<KvTipos onOpenChat={openTheater} />
			<KvContemplacao />
			<div id="faq" className="scroll-mt-24">
				<KvFaq />
			</div>
			<KvNumbers />
			<KvDepoimentos onOpenChat={openTheater} />
			<div id="confianca" className="scroll-mt-24">
				<KvConfianca />
			</div>
			<KvComparacao />
			<KvFooter onOpenChat={openTheater} />
		</main>
	);
}
