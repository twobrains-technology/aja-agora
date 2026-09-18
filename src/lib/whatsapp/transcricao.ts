// Transcrição do áudio que o cliente manda no WhatsApp (AJA-15).
//
// Até 2026-09-18 não havia ASR nenhum no repositório. O áudio inbound era
// baixado, guardado no storage e registrado no histórico como a string fixa
// "Áudio recebido" — nenhum turno do agente disparava. Efeito medido em prod: 18
// áudios em 30 dias, todos virando a mesma frase vazia; na conversa `39bd4482`
// o agente repetiu a mesma pergunta de crédito 16 vezes porque nunca recebeu o
// que o lead falou.
//
// Isto aqui é a chamada crua ao gateway. A decisão de QUANDO transcrever e o que
// fazer com o texto é de `midia-do-cliente.ts`; a conversa (como responder ao
// que foi dito) continua sendo do modelo.
//
// Desligada por padrão: sem `TRANSCRICAO_AUDIO_ATIVA=true` nada disto roda e o
// comportamento é byte a byte o de antes. A trava é de propósito — a variável
// nova nasce ausente-desligada, nunca "ligada por acidente" (ver CLAUDE.md).

/** Teto da chamada ao gateway. Áudio de WhatsApp é curto; 20s é folga larga. */
export const TRANSCRICAO_TIMEOUT_MS = 20_000;

/** Nome do campo `file` no multipart — a extensão ajuda o gateway a adivinhar o
 * codec, então ela vem do mime quando dá. */
const EXTENSAO_POR_MIME: Record<string, string> = {
	"audio/ogg": "ogg",
	"audio/opus": "opus",
	"audio/mpeg": "mp3",
	"audio/mp4": "m4a",
	"audio/amr": "amr",
	"audio/wav": "wav",
	"audio/webm": "webm",
};

export interface TranscricaoResultado {
	texto: string;
	modelo: string;
	/** Duração da CHAMADA ao gateway, em ms — a latência que o cliente espera. */
	duracaoMs: number;
}

/** Falha tipada: quem chama decide o que dizer ao cliente, aqui não há copy. */
export class TranscricaoFalhouError extends Error {
	readonly causa?: unknown;

	constructor(motivo: string, causa?: unknown) {
		super(`transcrição falhou: ${motivo}`);
		this.name = "TranscricaoFalhouError";
		this.causa = causa;
	}
}

export interface TranscricaoDeps {
	fetch: typeof fetch;
	baseUrl: string;
	apiKey: string;
	modelo: string;
	timeoutMs: number;
}

/**
 * A feature só liga com `TRANSCRICAO_AUDIO_ATIVA` exatamente `true`. Qualquer
 * outro valor (vazio, ausente, "1", "sim") mantém desligado — o mesmo contrato
 * de nasce-desligada da régua de remarketing.
 */
export function transcricaoAtiva(env: Record<string, string | undefined> = process.env): boolean {
	return env.TRANSCRICAO_AUDIO_ATIVA?.trim().toLowerCase() === "true";
}

export function defaultTranscricaoDeps(
	env: Record<string, string | undefined> = process.env,
): TranscricaoDeps {
	return {
		fetch: (input, init) => fetch(input, init),
		baseUrl: (env.LITELLM_BASE_URL ?? "").trim().replace(/\/+$/, ""),
		apiKey: (env.LITELLM_API_KEY ?? "").trim(),
		modelo: env.TRANSCRICAO_MODELO?.trim() || "whisper-1",
		timeoutMs: TRANSCRICAO_TIMEOUT_MS,
	};
}

/**
 * `POST {gateway}/audio/transcriptions` no formato OpenAI (multipart), que é o
 * que o LiteLLM expõe para os provedores de ASR. `language: "pt"` porque o
 * público é brasileiro — sem ele o Whisper às vezes "traduz" em vez de transcrever.
 */
export async function transcrever(
	bytes: Uint8Array,
	mimeType: string,
	over: Partial<TranscricaoDeps> = {},
): Promise<TranscricaoResultado> {
	const deps = { ...defaultTranscricaoDeps(), ...over };
	if (!deps.baseUrl) throw new TranscricaoFalhouError("LITELLM_BASE_URL ausente");

	const inicio = Date.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), deps.timeoutMs);

	try {
		const form = new FormData();
		const extensao = EXTENSAO_POR_MIME[mimeType] ?? "ogg";
		// Cópia para um `Uint8Array<ArrayBuffer>` — o `Uint8Array<ArrayBufferLike>`
		// que vem do download não é aceito como `BlobPart` pelo TypeScript.
		const arquivo = new Uint8Array(bytes.length);
		arquivo.set(bytes);
		form.append("file", new Blob([arquivo], { type: mimeType }), `audio.${extensao}`);
		form.append("model", deps.modelo);
		form.append("language", "pt");

		const resposta = await deps.fetch(`${deps.baseUrl}/audio/transcriptions`, {
			method: "POST",
			headers: { Authorization: `Bearer ${deps.apiKey}` },
			body: form,
			signal: controller.signal,
		});

		if (!resposta.ok) {
			throw new TranscricaoFalhouError(`gateway respondeu ${resposta.status}`);
		}

		const json = (await resposta.json()) as { text?: unknown };
		const texto = typeof json.text === "string" ? json.text.trim() : "";
		if (!texto) throw new TranscricaoFalhouError("texto vazio");

		return { texto, modelo: deps.modelo, duracaoMs: Date.now() - inicio };
	} catch (err) {
		if (err instanceof TranscricaoFalhouError) throw err;
		const motivo = controller.signal.aborted
			? `timeout de ${deps.timeoutMs}ms`
			: "falha de rede ou resposta ilegível";
		throw new TranscricaoFalhouError(motivo, err);
	} finally {
		clearTimeout(timer);
	}
}
