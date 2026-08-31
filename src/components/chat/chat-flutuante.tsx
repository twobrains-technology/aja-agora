"use client";

import { useEffect, useState } from "react";

import { useTheater } from "@/components/chat/theater/theater-context";
import { WhatsappGlyph } from "@/components/icons/whatsapp-glyph";
import { carimbarOrigem, lerCodigoDeOrigemDoCookie } from "@/lib/attribution/codigo-de-origem";
import { WHATSAPP_OFICIAL_DIGITOS } from "@/lib/bevi/closing-presentation";

/** A fala que já vai escrita para o cliente só apertar enviar. Sem ela, quem
 *  chega no WhatsApp encara uma conversa vazia e trava; e do outro lado é o
 *  MESMO agente, que começa a conversa sabendo de onde a pessoa veio. */
const PRIMEIRA_FALA = "Oi! Quero comparar consórcios.";

/**
 * `wa.me` é o link universal da Meta e é o que resolve o pedido do celular:
 * no telefone ele abre o APP nativo do WhatsApp direto (o `intent` de Android e
 * o universal link de iOS ficam por conta do próprio sistema), e no desktop cai
 * no WhatsApp Web. Um esquema `whatsapp://` faria o app abrir no celular e dar
 * página morta em qualquer computador.
 */
function linkDoWhatsapp(codigo: string | null): string {
	const fala = carimbarOrigem(PRIMEIRA_FALA, codigo);
	return `https://wa.me/${WHATSAPP_OFICIAL_DIGITOS}?text=${encodeURIComponent(fala)}`;
}

/**
 * Botão flutuante do WhatsApp — fica parado no canto inferior direito da TELA e
 * não acompanha o conteúdo, em qualquer ponto da rolagem (pedido do cliente,
 * 2026-08-20).
 *
 * O problema que resolve: no celular, todo caminho para a conversa estava no
 * topo da página. Quem rolava até o FAQ ou os depoimentos — justamente quem
 * ficou interessado o bastante para descer — tinha que voltar ao hero para
 * falar com a Aja.
 *
 * **Leva para o WhatsApp, e não para o chat da própria página** (decisão do
 * Kairo, 20/08/2026). Os dois falam com o mesmo agente, mas a conversa que
 * continua no telefone da pessoa sobrevive ao fechar da aba — e é lá que o
 * atendente humano assume no fim do funil. O chat web continua a um toque no
 * hero e no fecho da página.
 *
 * **Só o círculo, sem rótulo** (decisão do Kairo, 20/08/2026, no fim do dia).
 * O selo escuro "Fale no WhatsApp" ao lado é o que faz widget de chat parecer
 * anúncio, e o glyph verde já diz sozinho o que acontece ao ser tocado — é a
 * convenção mais reconhecível que existe no celular brasileiro. Junto com o
 * rótulo saiu o mecanismo que o recolhia durante a rolagem: sem texto para
 * aparar, o debounce de `scroll`, o `prefers-reduced-motion` e o
 * `data-recolhido` não tinham mais o que fazer.
 *
 * Continua consultando `useTheater()` por um motivo só: sumir enquanto o teatro
 * está aberto.
 */
export function ChatFlutuante() {
	const { isOpen } = useTheater();

	// A3 — o carimbo de origem, resolvido só no cliente.
	//
	// `useEffect` e não leitura direta no corpo: `document.cookie` não existe no
	// servidor, e um href diferente entre o HTML e a primeira renderização do
	// cliente seria erro de hidratação. Assim as duas passagens montam o mesmo
	// link sem código, e o carimbo entra logo depois — antes de qualquer toque
	// humano possível.
	const [codigo, setCodigo] = useState<string | null>(null);
	useEffect(() => {
		setCodigo(lerCodigoDeOrigemDoCookie());
	}, []);

	// Some com o teatro aberto. O `z-40` já o deixa por baixo do overlay (`z-[90]`
	// em chat-theater.tsx), mas um alvo vivo atrás do scrim é toque fantasma.
	if (isOpen) return null;

	return (
		<a
			// O href nasce SEM carimbo e ganha o código depois da hidratação (ver
			// `codigo` acima). Sempre um link real, em qualquer instante: quem tocar
			// nos milissegundos antes da hidratação chega ao WhatsApp do mesmo jeito
			// — perde a atribuição daquele toque, que é exatamente o que acontecia
			// em 100% dos toques até 30/08/2026.
			href={linkDoWhatsapp(codigo)}
			target="_blank"
			// `noopener`: sem ele a aba do WhatsApp recebe `window.opener` e pode
			// mexer nesta página.
			rel="noopener noreferrer"
			// O nome acessível é o que sobrou do rótulo: sem texto na tela, é a única
			// coisa que diz a quem lê a tela para onde este círculo leva.
			aria-label="Fale no WhatsApp"
			// `data-heat-id` dá identidade estável a ele no mapa de calor: o botão
			// vive fora de qualquer `[data-heat]`, então o caminho estrutural não
			// diria nada (ver ATRIBUTOS_ESTAVEIS em src/lib/heatmap/selector.ts).
			data-heat-id="whatsapp-flutuante"
			// `env(safe-area-inset-bottom)`: sem isso o botão fica embaixo da barra
			// de endereço do Safari no iPhone, que é exatamente aquele canto.
			style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
			// VERDE DA MARCA DO WHATSAPP (#25D366), o mesmo já usado no card de
			// handoff e no opt-in. A cor aqui não é enfeite: é o que faz o círculo
			// ser lido como "isto abre o WhatsApp" sem nenhum texto. A sombra segue
			// a cor do botão.
			className="fixed right-4 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_-4px_#25D36680] md:right-6"
		>
			<WhatsappGlyph className="size-7" />
		</a>
	);
}
