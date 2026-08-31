// Eventos do pixel no navegador.
//
// O pixel (`analytics-scripts.tsx`) só dispara `PageView`. Isso basta para
// remarketing de página, mas não responde à pergunta que a mídia faz o tempo
// todo: "quantos dos que chegaram COMEÇARAM a conversar?". O chat aqui é um
// overlay — abrir o Modo Teatro não muda a URL —, então nem a regra "URL
// contém" nem "referring domain" do Gerenciador conseguem marcar isso. Só um
// evento consegue.
//
// `trackCustom` e não `track`: `ChatIniciado` não é evento do vocabulário da
// Meta, e mandá-lo como padrão faria a Meta descartar o nome. Sobre um evento
// personalizado a mídia monta a conversão personalizada, com ou sem filtro de
// parâmetro.
//
// Best-effort por natureza: bloqueador de anúncio, `fbq` ausente (o pixel só
// carrega se `NEXT_PUBLIC_META_PIXEL_ID` foi assado no build) e erro de rede
// não podem, em nenhuma hipótese, atrapalhar a abertura do chat.

import {
	chaveDoInicioDeConversa,
	NOME_CHAT_INICIADO,
} from "@/lib/conversions/chave-do-inicio-de-conversa";

type Fbq = (...args: unknown[]) => void;

/** Vertical pela rota — o mesmo mapa do catálogo, do lado do cliente. */
const VERTICAL_POR_ROTA: Record<string, string> = {
	"/autos": "auto",
	"/motos": "moto",
	"/imoveis": "imovel",
	"/": "home",
};

export interface ChatIniciadoParams {
	/** `chip`, `digitada`, `campanha` — por onde a conversa começou. */
	origem?: string;
	/** Item do catálogo, quando a pessoa chegou por anúncio (`auto-50000`). */
	contentId?: string | null;
	/**
	 * O id desta abertura, sorteado por quem chama. É ele que o servidor manda
	 * junto no evento de CAPI (B3, 30/08/2026), e é por ele que a Meta reconhece
	 * os dois caminhos como o MESMO início de conversa.
	 *
	 * Sem ele o pixel continua disparando como antes — o que é o comportamento
	 * certo para qualquer chamador que ainda não conheça a ponte.
	 */
	eventId?: string | null;
}

/** "Esta pessoa começou a conversar." Um por abertura do teatro. */
export function rastrearChatIniciado(params: ChatIniciadoParams = {}): void {
	if (typeof window === "undefined") return;

	const fbq = (window as unknown as { fbq?: Fbq }).fbq;
	if (typeof fbq !== "function") return;

	const rota = window.location.pathname.replace(/\/$/, "") || "/";

	try {
		fbq(
			"trackCustom",
			NOME_CHAT_INICIADO,
			{
				content_category: VERTICAL_POR_ROTA[rota] ?? "outra",
				origem: params.origem ?? "desconhecida",
				pagina: rota,
				...(params.contentId ? { content_ids: [params.contentId], content_type: "product" } : {}),
			},
			// DEDUPLICAÇÃO (B3). O quarto argumento do `fbq` é o objeto de opções, e
			// `eventID` é o campo que a Meta cruza com o `event_id` que chega pela
			// Conversions API. Sem ele, ligar o caminho server-side faria a mesma
			// abertura contar DUAS vezes — e o sintoma seria uma métrica que subiu,
			// que é o tipo de defeito que ninguém investiga.
			params.eventId ? { eventID: chaveDoInicioDeConversa(params.eventId) } : undefined,
		);
	} catch {
		// Medir nunca derruba o produto.
	}
}

/**
 * Avisa o servidor que o teatro abriu, para o mesmo evento existir do lado de
 * lá (item B3).
 *
 * **`sendBeacon` e SÓ ele.** A abertura do teatro é seguida de uma animação e,
 * às vezes, de a pessoa fechar a aba: `sendBeacon` entrega mesmo com a página
 * sumindo, é enfileirado pelo navegador fora da main thread e não disputa banda
 * com o carregamento do chat.
 *
 * Havia aqui um fallback em `fetch({ keepalive: true })` para o caso de
 * `sendBeacon` não existir. Ele saiu em 30/08/2026, e não por estilo: em
 * ambiente sem `sendBeacon` — que é o caso do `happy-dom` — aquele `fetch`
 * disparava REQUISIÇÃO DE REDE DE VERDADE a partir de um teste unitário. Com o
 * servidor de desenvolvimento de pé, um `pnpm test:unit` gravava
 * `chat_iniciado` no banco local; e a rejeição do fetch abortado no teardown
 * escapava do `.catch`, deixando a suíte com 10 `Unhandled Error` e **exit 1**
 * com 3.718 testes verdes na tela.
 *
 * Perder o fallback não custa nada real: `sendBeacon` é suportado em todos os
 * navegadores desde 2016, e o único ambiente sem ele é justamente o de teste.
 * A ausência silenciosa é o comportamento certo — o pixel do lado do cliente
 * continua disparando, e o que se perde é a metade server-side de um sinal de
 * mídia, jamais a abertura do chat.
 */
export function avisarServidorDoChatIniciado(eventId: string): void {
	if (typeof window === "undefined") return;
	if (typeof navigator.sendBeacon !== "function") return;

	try {
		navigator.sendBeacon(
			"/api/track/chat-iniciado",
			new Blob([JSON.stringify({ eventId })], { type: "application/json" }),
		);
	} catch {
		// Medir nunca derruba o produto.
	}
}
