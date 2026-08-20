"use client";

import { MessageCircleMore } from "lucide-react";
import { useEffect, useState } from "react";

import { useTheater } from "@/components/chat/theater/theater-context";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

/** Quanto a página precisa ficar quieta para o rótulo voltar. */
const PARADA_MS = 500;

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
 * Botão flutuante do chat — fica parado no canto inferior direito da TELA e não
 * acompanha o conteúdo, em qualquer ponto da rolagem (pedido do cliente,
 * 2026-08-20).
 *
 * O problema que resolve: no celular, todo caminho para a conversa estava no
 * topo da página. Quem rolava até o FAQ ou os depoimentos — justamente quem
 * ficou interessado o bastante para descer — tinha que voltar ao hero para
 * falar com a Aja.
 *
 * **O rótulo recolhe enquanto a página rola e volta quando ela para.** Um
 * retângulo escuro parado por cima do conteúdo em movimento é o que faz widget
 * de chat parecer anúncio; recolhido, sobra o círculo, que ocupa pouco e
 * continua dizendo o que é. A AÇÃO nunca some junto: o botão segue clicável o
 * tempo todo, inclusive no meio da rolagem — some o rótulo, não o alvo.
 *
 * Vale nas duas larguras. Nasceu só no mobile e perdeu o `md:hidden` quando o
 * desktop foi alinhado ao mesmo desenho: o hero passou a ter UM CTA, então lá
 * também existe página demais entre o topo e a próxima chance de conversar.
 *
 * Consome `useTheater()` direto em vez de receber `onOpenChat` por prop: ele é
 * montado ao lado do `<ChatTheater/>`, fora da árvore das seções, e passar a
 * função por seis páginas só para chegar aqui seria fiação sem ganho.
 */
export function ChatFlutuante() {
	const { isOpen, openTheater } = useTheater();
	const reduzido = useReducedMotion();

	// Com `prefers-reduced-motion` o rótulo fica sempre aberto: recolher e abrir
	// é justamente o movimento que a pessoa pediu para não ver, e a alternativa
	// (sumir sem transição) piscaria, que é pior.
	const recolhido = useRolando(!isOpen && !reduzido);

	// Some com o teatro aberto. O `z-40` já o deixa por baixo do overlay (`z-[90]`
	// em chat-theater.tsx), mas um botão vivo atrás do scrim é alvo de toque
	// fantasma — e o morph de entrada sai deste elemento, que não pode estar
	// desaparecendo por baixo ao mesmo tempo.
	if (isOpen) return null;

	return (
		<button
			type="button"
			onClick={(e) => openTheater("", e.currentTarget)}
			aria-label="Fale com a gente"
			// `data-heat-id` dá identidade estável a ele no mapa de calor: o botão
			// vive fora de qualquer `[data-heat]`, então o caminho estrutural não
			// diria nada (ver ATRIBUTOS_ESTAVEIS em src/lib/heatmap/selector.ts).
			data-heat-id="chat-flutuante"
			data-recolhido={recolhido ? "" : undefined}
			// `env(safe-area-inset-bottom)`: sem isso o botão fica embaixo da barra
			// de endereço do Safari no iPhone, que é exatamente aquele canto.
			style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
			className="fixed right-4 z-40 flex items-center md:right-6"
		>
			{/* `aria-hidden` no rótulo porque o nome acessível já vem do `aria-label`
			    do botão. Sem isso o leitor de tela anunciaria a frase duas vezes — e,
			    pior, o nome do botão MUDARIA ao rolar. Para quem lê a tela, este
			    botão se chama a mesma coisa o tempo todo.

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
				Fale com a gente
			</span>
			{/* AZUL DA MARCA, e não o coral (decisão do Kairo, 20/08/2026): `--aja-blue`
			    #036eff, o mesmo token de `globals.css`. O coral é a cor dos CTAs de
			    conversão da página (KvCtaButton); este botão acompanha a rolagem por
			    cima de todas as seções, e repetir o coral fazia ele ler como "mais um
			    CTA" em vez de atalho permanente para a conversa. A sombra segue a cor
			    do botão, como era com o coral. */}
			<span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#036EFF] text-white shadow-[0_8px_24px_-4px_#036EFF80]">
				<MessageCircleMore className="size-6" strokeWidth={2} aria-hidden="true" />
			</span>
		</button>
	);
}
