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
}

/** "Esta pessoa começou a conversar." Um por abertura do teatro. */
export function rastrearChatIniciado(params: ChatIniciadoParams = {}): void {
	if (typeof window === "undefined") return;

	const fbq = (window as unknown as { fbq?: Fbq }).fbq;
	if (typeof fbq !== "function") return;

	const rota = window.location.pathname.replace(/\/$/, "") || "/";

	try {
		fbq("trackCustom", "ChatIniciado", {
			content_category: VERTICAL_POR_ROTA[rota] ?? "outra",
			origem: params.origem ?? "desconhecida",
			pagina: rota,
			...(params.contentId ? { content_ids: [params.contentId], content_type: "product" } : {}),
		});
	} catch {
		// Medir nunca derruba o produto.
	}
}
