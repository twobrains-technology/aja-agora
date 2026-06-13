"use client";

import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { BrandFooter } from "@/components/landing/brand-footer";
import { BrandNav } from "@/components/landing/brand-nav";
import { Closing } from "@/components/landing/closing";
import { Demo } from "@/components/landing/demo";
import { Hero } from "@/components/landing/hero";
import { Institutional } from "@/components/landing/institutional";
import { Process } from "@/components/landing/process";
import { Trust } from "@/components/landing/trust";

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
		<main className="flex min-h-screen flex-col bg-[#fbfbf9]">
			<BrandNav onStart={openTheater} />
			<Hero onOpenChat={openTheater} />
			<Trust />
			<Process />
			<Demo />
			<Institutional />
			<Closing onStart={openTheater} />
			<BrandFooter />
		</main>
	);
}
