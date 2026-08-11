"use client";

import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvMenu } from "@/components/kv/kv-menu";
import { DocumentoLegal } from "@/components/legal/documento-legal";

import { ATUALIZADO_EM, DESTAQUE_TERMOS, HERO_TERMOS, SECOES_TERMOS } from "./conteudo";

// Página de Termos de Uso.
//
// Mesmo desenho da Política de Privacidade — as duas são o mesmo tipo de
// documento e chegam pelo mesmo lugar, os dois links no fim do rodapé. Sem o
// CTA final, como nas outras páginas de conformidade: quem veio ler as regras
// não está no fim de um funil de venda.
export default function TermosDeUsoPage() {
	return (
		<TheaterProvider>
			<PaginaTermos />
			{/* Overlay "Modo Teatro" — morfa do elemento clicado sobre a página desfocada. */}
			<ChatTheater />
		</TheaterProvider>
	);
}

function PaginaTermos() {
	const { openTheater } = useTheater();

	return (
		<main
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} flex min-h-screen flex-col bg-[var(--aja-paper)] font-sans text-[color:var(--aja-ink)] antialiased`}
		>
			<KvMenu onOpenChat={openTheater} />

			<DocumentoLegal
				hero={HERO_TERMOS}
				destaque={DESTAQUE_TERMOS}
				atualizadoEm={ATUALIZADO_EM}
				secoes={SECOES_TERMOS}
			/>

			<KvFooter onOpenChat={openTheater} comCtaFinal={false} />
		</main>
	);
}
