// Classificação de falha do LLM — o que a falha QUER DIZER, sem I/O.
//
// Por que existe: em 01/10/2026 a produção levou 29× HTTP 400 "Your credit
// balance is too low to access the Anthropic API" entre 10:50 e 11:52 e ninguém
// foi avisado. No web, `error.message` cru (em inglês) ia para o cliente; no
// WhatsApp, só um `console.error`. Falha silenciosa de agente é o defeito que
// mais custa: o cliente recebe um turno quebrado e quem opera não sabe.
//
// A classificação é PURA (sem rede, sem e-mail, sem banco) para ser provada por
// teste — a borda que alerta mora em `alerta-do-llm.ts`. Isso segue o padrão da
// casa (a função decide, a borda faz I/O) e é o que impede um teste de disparar
// SendGrid de verdade.
//
// O reconhecimento é por TEXTO e por STATUS do erro, nunca por regex sobre a
// fala do agente — a falha do LLM é objeto do servidor, não conversa.

/** O tipo decidido. Fechado de propósito: um quarto valor só entra se pedir
 *  uma AÇÃO diferente de quem opera. */
export type TipoDeErroDoLlm = "billing" | "rate_limit" | "indisponivel" | "outro";

/** Junta todo o texto relevante do erro (message, responseBody, cause). O SDK
 *  do gateway embrulha o erro do provider em `cause`/`responseBody`, então ler
 *  só o `message` deixaria a causa passar batida. */
function textoDoErro(err: unknown): string {
	const partes: string[] = [];
	const vistos = new Set<unknown>();
	let atual: unknown = err;

	while (atual && typeof atual === "object" && !vistos.has(atual)) {
		vistos.add(atual);
		const forma = atual as Record<string, unknown>;
		for (const campo of ["message", "responseBody", "name", "error"] as const) {
			const valor = forma[campo];
			if (typeof valor === "string") partes.push(valor);
		}
		atual = forma.cause ?? forma.error;
	}

	if (typeof err === "string") partes.push(err);
	return partes.join(" | ").toLowerCase();
}

/** O status HTTP, quando o erro carrega um (`statusCode` é o nome do AI SDK;
 *  `status` aparece em wrappers do gateway). */
function statusDoErro(err: unknown): number | undefined {
	if (!err || typeof err !== "object") return undefined;
	const forma = err as Record<string, unknown>;
	for (const campo of ["statusCode", "status"] as const) {
		const valor = forma[campo];
		if (typeof valor === "number" && Number.isFinite(valor)) return valor;
	}
	return undefined;
}

/** Sinais textuais de crédito/cobrança no provider. O caso medido é o da
 *  Anthropic ("credit balance is too low"); os demais cobrem o mesmo defeito
 *  no dialeto OpenAI ("insufficient_quota", "exceeded your current quota"). */
const SINAIS_DE_BILLING = [
	"credit balance is too low",
	"credit balance",
	"insufficient_quota",
	"insufficient quota",
	"exceeded your current quota",
	"quota exceeded",
	"billing",
	"payment required",
];

const SINAIS_DE_RATE_LIMIT = [
	"rate limit",
	"rate_limit",
	"ratelimit",
	"too many requests",
	"requests per minute",
	"tokens per minute",
];

const SINAIS_DE_INDISPONIVEL = [
	"overloaded",
	"unavailable",
	"timeout",
	"timed out",
	"econnreset",
	"econnrefused",
	"fetch failed",
	"socket hang up",
	"service temporarily",
	"internal server error",
];

function contem(texto: string, sinais: readonly string[]): boolean {
	return sinais.some((s) => texto.includes(s));
}

/**
 * Decide o tipo de falha do LLM. A ordem importa: billing vence rate-limit
 * (os dois podem citar 400/quota), e rate-limit vence indisponível.
 */
export function classificarErroDoLlm(err: unknown): TipoDeErroDoLlm {
	const texto = textoDoErro(err);
	const status = statusDoErro(err);

	if (contem(texto, SINAIS_DE_BILLING)) return "billing";

	if (status === 429 || contem(texto, SINAIS_DE_RATE_LIMIT)) return "rate_limit";

	if (
		(status !== undefined && status >= 500) ||
		status === 529 ||
		contem(texto, SINAIS_DE_INDISPONIVEL)
	) {
		return "indisponivel";
	}

	return "outro";
}