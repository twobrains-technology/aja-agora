"use client";

import Link from "next/link";

import { ChatTheater } from "@/components/chat/theater/chat-theater";
import { TheaterProvider, useTheater } from "@/components/chat/theater/theater-context";
import { lato, manrope, merriweather } from "@/components/kv/fonts";
import { KvFooter } from "@/components/kv/kv-footer";
import { KvMenu } from "@/components/kv/kv-menu";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton, kvCtaClass } from "@/components/kv/ui/kv-cta-button";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

const CONTEUDO = {
	eyebrow: "CARTA NÃO ENCONTRADA",
	titulo: "Ops! Erro 404",
	texto:
		"Parece que esse caminho não faz parte da nossa jornada. O endereço digitado pode ter mudado de lance ou simplesmente não existe mais.",
	voltar: "Voltar para o Início",
	conversar: "Falar com a AJA",
};

// Página 404 (Figma 'pagina-404' 625:4639). Arquivo especial do App Router:
// atende qualquer rota que não casar, então herda o cabeçalho e o rodapé do
// site para a pessoa ter para onde ir em vez de só bater na parede.
export default function NotFound() {
	return (
		<TheaterProvider>
			<Pagina404 />
			{/* Overlay "Modo Teatro" — morfa do elemento clicado sobre a página desfocada. */}
			<ChatTheater />
		</TheaterProvider>
	);
}

function Pagina404() {
	const { openTheater } = useTheater();

	return (
		<main
			className={`${merriweather.variable} ${lato.variable} ${manrope.variable} flex min-h-screen flex-col bg-[var(--aja-paper)] font-sans text-[color:var(--aja-ink)] antialiased`}
		>
			<KvMenu onOpenChat={openTheater} />

			{/* `flex-1` para o rodapé encostar na base da janela mesmo nesta página
			    curta — sem isso o navy ficaria boiando no meio da tela em monitor
			    grande, que é o defeito clássico de página de erro. */}
			<section className="relative flex flex-1 items-center overflow-hidden py-20 md:py-28">
				{/* Blobs rosa desfocados (Figma 'Left/Right Blob Decoration'). */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -left-[150px] top-[150px] size-[400px] rounded-full bg-[#FFE0E3] opacity-60 blur-[120px]"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -right-[110px] top-[100px] size-[450px] rounded-full bg-[#FFE0E3] opacity-50 blur-[180px]"
				/>

				<KvContainer className="max-w-[1240px]">
					<div className="relative z-10 mx-auto flex max-w-[711px] flex-col items-center text-center">
						<KvEyebrow className="tracking-[0.18em]">{CONTEUDO.eyebrow}</KvEyebrow>
						<h1 className="mt-5 text-[44px] font-bold leading-[1.05] text-[color:var(--aja-ink)] md:text-[64px] lg:text-[83px]">
							{CONTEUDO.titulo}
						</h1>
						<p className="mt-6 max-w-[550px] text-[18px] leading-[1.6] text-[#2D2D2D] md:text-[20px]">
							{CONTEUDO.texto}
						</p>
						<div className="mt-10 flex flex-col gap-4 sm:flex-row sm:gap-5">
							{/* Âncora, não botão: leva para outra rota, então tem de abrir em
							    nova aba com o meio do mouse e aparecer no histórico. */}
							<Link href="/" className={kvCtaClass()}>
								{CONTEUDO.voltar}
							</Link>
							<KvCtaButton variant="outline" onClick={(e) => openTheater("", e.currentTarget)}>
								{CONTEUDO.conversar}
							</KvCtaButton>
						</div>
					</div>
				</KvContainer>
			</section>

			<KvFooter onOpenChat={openTheater} comCtaFinal={false} />
		</main>
	);
}
