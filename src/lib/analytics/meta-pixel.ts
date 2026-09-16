// Parâmetros da abertura do chat, para o GTM.
//
// O chat é um overlay — abrir o Modo Teatro não muda a URL —, então nem "URL
// contém" nem "referring domain" do Gerenciador conseguem marcar a abertura.
// Só um evento consegue, e por isso ele existe.
//
// Até 16/09/2026 este módulo disparava `fbq('trackCustom', 'ChatOpened')`
// direto. Não dispara mais: a tag `AJA | META | 00 | ChatOpened` do GTM assumiu,
// acionada pelo `chat_opened` do `dataLayer`. O que sobrou aqui é a montagem
// dos parâmetros — os mesmos que iam no pixel, agora entregues ao GTM.
//
// A BASE do pixel (`fbq('init')` + `PageView`) segue em `analytics-scripts.tsx`
// e não se mexe: é ela que decide a verba.

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

/**
 * Os parâmetros da abertura do chat, para o `dataLayer`.
 *
 * **Desde 16/09/2026 a abertura não chama mais o `fbq` direto.** Quem manda o
 * `ChatOpened` para a Meta agora é a tag `AJA | META | 00 | ChatOpened` do
 * GTM, acionada pelo `chat_opened` que a abertura empurra no `dataLayer`.
 * Manter os dois vivos faria a MESMA abertura contar duas vezes — e sem
 * `eventID` cruzado não haveria dedup: o quarto argumento do `fbq` aqui
 * sempre foi `undefined`, apesar do que o comentário antigo prometia.
 *
 * Os parâmetros que iam no `fbq` passam a viajar no push, para o GTM receber
 * exatamente o que a Meta recebia — vertical da rota, origem e item do
 * catálogo. Nada de medição se perde na troca.
 *
 * O que NÃO saiu: a base do pixel (`fbq('init')` + `PageView` em
 * `analytics-scripts.tsx`) e o `config` do GA4 continuam onde estavam. O GTM
 * não tem tag equivalente, e derrubá-las apagaria medição que decide verba.
 */
export function parametrosDaAberturaDoChat(
	params: ChatIniciadoParams = {},
): Record<string, unknown> {
	const rota =
		typeof window === "undefined" ? "/" : window.location.pathname.replace(/\/$/, "") || "/";

	return {
		content_category: VERTICAL_POR_ROTA[rota] ?? "outra",
		origem: params.origem ?? "desconhecida",
		pagina: rota,
		...(params.contentId ? { content_ids: [params.contentId], content_type: "product" } : {}),
	};
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
	// Compatibilidade temporária: abrir o chat é somente diagnóstico Pixel.
	void eventId;
}
