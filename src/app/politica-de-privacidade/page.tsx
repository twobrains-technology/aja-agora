"use client";

import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvMenu } from "@/components/kv/kv-menu";
import { DocumentoLegal } from "@/components/legal/documento-legal";

import { ATUALIZADO_EM, DESTAQUE_LGPD, HERO_POLITICA, SECOES_POLITICA } from "./conteudo";

// Página de Política de Privacidade (Figma 'politica-de-privacidade' 625:4545).
//
// Documento de texto corrido: sem seção reaproveitável do Key Visual no miolo,
// só cabeçalho e rodapé compartilhados. O miolo saiu daqui para
// `DocumentoLegal` quando os Termos de Uso chegaram com a mesma estrutura.
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

			<DocumentoLegal
				hero={HERO_POLITICA}
				destaque={DESTAQUE_LGPD}
				atualizadoEm={ATUALIZADO_EM}
				secoes={SECOES_POLITICA}
			/>

			<KvFooter onOpenChat={openTheater} comCtaFinal={false} />
		</main>
	);
}
