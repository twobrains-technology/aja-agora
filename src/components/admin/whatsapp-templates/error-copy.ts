// Deriva a mensagem de erro exibida ao admin a partir de uma Response !ok das
// rotas de templates. Reutilizado pelo submit (row-actions) e pode servir ao
// Sincronizar/form dialog. Regras:
//   1. Se o body é JSON de erro NOSSO com `message` → usa a message (é útil e
//      específica, ex: erro da Meta repassado no 502 do submit/route).
//   2. Senão, se o status é 5xx (gateway: 502/503 do Cloudflare com body HTML,
//      500 mudo) → cópia amigável PT-BR (não vaza "HTTP 502" nem HTML cru).
//   3. Senão, se há `error` no JSON → usa `error`.
//   4. Fallback → cópia amigável.

export const GATEWAY_UNAVAILABLE_COPY =
	"Serviço temporariamente indisponível ao falar com a Meta. Tente novamente em instantes.";

export async function errorMessageFromResponse(res: Response): Promise<string> {
	let body: { message?: string; error?: string } | null = null;
	try {
		// .json() lança se o body não for JSON (ex: HTML do Cloudflare) → body fica null.
		body = (await res.clone().json()) as { message?: string; error?: string };
	} catch {
		body = null;
	}

	if (body?.message) return body.message;
	if (res.status >= 500) return GATEWAY_UNAVAILABLE_COPY;
	if (body?.error) return body.error;
	return GATEWAY_UNAVAILABLE_COPY;
}
