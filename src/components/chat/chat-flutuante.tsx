"use client";

import { useEffect, useState } from "react";

import { useTheater } from "@/components/chat/theater/theater-context";
import { WhatsappGlyph } from "@/components/icons/whatsapp-glyph";
import { WHATSAPP_OFICIAL_DIGITOS } from "@/lib/bevi/closing-presentation";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

/** Quanto a página precisa ficar quieta para o rótulo voltar. */
const PARADA_MS = 500;

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
const LINK_WHATSAPP = `https://wa.me/${WHATSAPP_OFICIAL_DIGITOS}?text=${encodeURIComponent(PRIMEIRA_FALA)}`;

/**
 * `true` enquanto a página está rolando; volta a `false` quando ela sossega.
 *
 * Debounce e não throttle: o que interessa é o INSTANTE em que a rolagem para,
 * e isso só se sabe pela ausência de eventos. Cada evento empurra o prazo para
 * frente; quando param de chegar, o último timeout dispara.
 */
function useRolando(ativo: boolean): boolean {
	const [rolando, setRolando] = useState(false);

	useEffect(() => {
		if (!ativo) {
			setRolando(false);
			return;
		}

		let id: ReturnType<typeof setTimeout>;
		const aoRolar = () => {
			setRolando(true);
			clearTimeout(id);
			id = setTimeout(() => setRolando(false), PARADA_MS);
		};

		// `passive`: este listener nunca chama preventDefault, e sem a dica o
		// navegador segura cada quadro esperando para descobrir isso. Travar a
		// rolagem num botão que existe para acompanhar a rolagem seria uma ironia
		// cara.
		window.addEventListener("scroll", aoRolar, { passive: true });
		return () => {
			window.removeEventListener("scroll", aoRolar);
			clearTimeout(id);
		};
	}, [ativo]);

	return rolando;
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
 * Kairo, 20/08/2026, na segunda rodada do dia). Os dois falam com o mesmo
 * agente, mas a conversa que continua no telefone da pessoa sobrevive ao fechar
 * da aba — e é lá que o atendente humano assume no fim do funil. O chat web
 * continua a um toque no hero e no fecho da página.
 *
 * **O rótulo recolhe enquanto a página rola e volta quando ela para.** Um
 * retângulo escuro parado por cima do conteúdo em movimento é o que faz widget
 * de chat parecer anúncio; recolhido, sobra o círculo, que ocupa pouco e
 * continua dizendo o que é. A AÇÃO nunca some junto: o botão segue clicável o
 * tempo todo, inclusive no meio da rolagem — some o rótulo, não o alvo.
 *
 * Continua consultando `useTheater()` por um motivo só: sumir enquanto o teatro
 * está aberto.
 */
export function ChatFlutuante() {
	const { isOpen } = useTheater();
	const reduzido = useReducedMotion();

	// Com `prefers-reduced-motion` o rótulo fica sempre aberto: recolher e abrir
	// é justamente o movimento que a pessoa pediu para não ver, e a alternativa
	// (sumir sem transição) piscaria, que é pior.
	const recolhido = useRolando(!isOpen && !reduzido);

	// Some com o teatro aberto. O `z-40` já o deixa por baixo do overlay (`z-[90]`
	// em chat-theater.tsx), mas um alvo vivo atrás do scrim é toque fantasma.
	if (isOpen) return null;

	return (
		<a
			href={LINK_WHATSAPP}
			target="_blank"
			// `noopener`: sem ele a aba do WhatsApp recebe `window.opener` e pode
			// mexer nesta página.
			rel="noopener noreferrer"
			aria-label="Fale no WhatsApp"
			// `data-heat-id` dá identidade estável a ele no mapa de calor: o botão
			// vive fora de qualquer `[data-heat]`, então o caminho estrutural não
			// diria nada (ver ATRIBUTOS_ESTAVEIS em src/lib/heatmap/selector.ts).
			// Nome novo porque a AÇÃO mudou: somar o clique de "abre o chat daqui"
			// com o de "sai para o WhatsApp" na mesma série compararia coisas
			// diferentes.
			data-heat-id="whatsapp-flutuante"
			data-recolhido={recolhido ? "" : undefined}
			// `env(safe-area-inset-bottom)`: sem isso o botão fica embaixo da barra
			// de endereço do Safari no iPhone, que é exatamente aquele canto.
			style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
			className="fixed right-4 z-40 flex items-center md:right-6"
		>
			{/* `aria-hidden` no rótulo porque o nome acessível já vem do `aria-label`.
			    Sem isso o leitor de tela anunciaria a frase duas vezes — e, pior, o
			    nome do botão MUDARIA ao rolar. Para quem lê a tela, este botão se
			    chama a mesma coisa o tempo todo.

			    Recolhe por `max-w` + `opacity`, e não por `display`: `display` não
			    anima, então o corte seria instantâneo — o oposto do pedido.
			    `overflow-hidden` + `whitespace-nowrap` fazem o texto ser aparado pela
			    borda em vez de quebrar em duas linhas no meio da transição. */}
			<span
				aria-hidden="true"
				className={`overflow-hidden whitespace-nowrap rounded-full bg-[#021628] py-2 text-[13px] font-semibold text-[#FAFAF3] shadow-[0_4px_16px_0_#00000029] transition-all duration-300 ease-out ${
					recolhido
						? "mr-0 max-w-0 -translate-x-2 px-0 opacity-0"
						: "mr-2 max-w-[200px] translate-x-0 px-3.5 opacity-100"
				}`}
			>
				Fale no WhatsApp
			</span>
			{/* VERDE DA MARCA DO WHATSAPP (#25D366), o mesmo já usado no card de
			    handoff e no opt-in. A cor aqui não é enfeite: é o que faz o círculo
			    ser lido como "isto abre o WhatsApp" antes de qualquer texto. A sombra
			    segue a cor do botão. */}
			<span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_-4px_#25D36680]">
				<WhatsappGlyph className="size-7" />
			</span>
		</a>
	);
}
