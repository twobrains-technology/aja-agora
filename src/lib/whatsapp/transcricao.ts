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
// ── Por que NÃO é o `/audio/transcriptions` do OpenAI ───────────────────────
//
// A primeira versão desta chamada era multipart para `${gateway}/audio/transcriptions`
// com `model` + `language=pt`, o formato OpenAI. Isso tinha dois defeitos:
//
// 1. **Quebrava em produção antes de sair do lugar.** O container de prod tem
//    `LITELLM_SRV_NAME` (Cloud Map) e NÃO tem `LITELLM_BASE_URL`, e o código
//    antigo exigia `LITELLM_BASE_URL` — toda transcrição morria em
//    "LITELLM_BASE_URL ausente", independente de modelo ou crédito. Medido em
//    20/09/2026. Aqui a base é resolvida por `resolveGatewayHost()`, o MESMO
//    caminho que o resto do app usa (SRV dinâmico), com `LITELLM_BASE_URL` como
//    atalho quando ela existe (host/dev).
//
// 2. **O provedor escolhido não tem esse endpoint.** O gateway não tem crédito
//    na OpenAI (`429 You have no credits remaining`, medido em 20/09/2026) e o
//    ASR do DashScope/Alibaba NÃO tem `/audio/transcriptions` — responde 404.
//    O caminho que funciona é `POST {gateway}/asr/qwen`, um **passthrough** do
//    LiteLLM (ver `general_settings.pass_through_endpoints` no config.yaml do
//    `litellm-shared`): corpo de `/chat/completions` com `input_audio` em
//    data-URI base64 e o texto em `choices[0].message.content`.
//
// Por que passthrough e não `model_list`: servido como modelo de chat, o
// DashScope devolve `message.annotations[].type = "audio_info"` e o pydantic do
// LiteLLM só aceita `url_citation` ali — `Invalid response object` (500). O
// passthrough repassa a resposta verbatim.
//
// `asr_options.language = "pt"` é obrigatório na prática, não enfeite: medido em
// 20/09/2026 com o mesmo áudio, SEM ele o modelo devolve espanhol ("Quiero
// comprar um carro...") e anota `language: en`; com ele, português correto.
//
// Desligada por padrão: sem `TRANSCRICAO_AUDIO_ATIVA=true` nada disto roda e o
// comportamento é byte a byte o de antes. A trava é de propósito — a variável
// nova nasce ausente-desligada, nunca "ligada por acidente" (ver CLAUDE.md).

import { resolveGatewayHost } from "@/lib/llm/gateway-anthropic";

/** Teto da chamada ao gateway. Áudio de WhatsApp é curto; 20s é folga larga. */
export const TRANSCRICAO_TIMEOUT_MS = 20_000;

/** Rota do passthrough no gateway — casa com `pass_through_endpoints` do
 * config do `litellm-shared`. Mudar aqui exige mudar lá. */
export const CAMINHO_DO_ASR = "/asr/qwen";

/** Modelo default do ASR no DashScope (endpoint internacional). O alias
 * `aja-prod-transcribe` do gateway aponta para este mesmo modelo, mas o
 * passthrough manda o nome do provedor no corpo — e a virtual key do aja
 * precisa permitir `qwen3-asr-flash` (ver `metadata.allowed_passthrough_routes`
 * e a lista `models` da chave). */
export const MODELO_ASR_PADRAO = "qwen3-asr-flash";

/** Idioma declarado ao provedor. Ver a nota do topo: sem isto vem espanhol. */
const IDIOMA = "pt";

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
	/** Base já resolvida (`http://host:porta`). Vazio ⇒ resolve pelo SRV na hora. */
	baseUrl: string;
	apiKey: string;
	modelo: string;
	timeoutMs: number;
	/** Injetável no teste: sem ela, a resolução é a de produção (Cloud Map). */
	resolverGateway?: () => Promise<string | null>;
}

/**
 * A feature só liga com `TRANSCRICAO_AUDIO_ATIVA` exatamente `true`. Qualquer
 * outro valor (vazio, ausente, "1", "sim") mantém desligado — o mesmo contrato
 * de nasce-desligada da régua de remarketing.
 */
export function transcricaoAtiva(env: Record<string, string | undefined> = process.env): boolean {
	return env.TRANSCRICAO_AUDIO_ATIVA?.trim().toLowerCase() === "true";
}

/** `host:porta` do SRV → base HTTP. O gateway fala HTTP dentro da VPC (o
 * `gatewayFetch` do provider Anthropic faz a mesma troca de host/protocolo). */
function baseDoHost(host: string | null): string {
	return host ? `http://${host}` : "";
}

export function defaultTranscricaoDeps(
	env: Record<string, string | undefined> = process.env,
): TranscricaoDeps {
	return {
		fetch: (input, init) => fetch(input, init),
		baseUrl: (env.LITELLM_BASE_URL ?? "").trim().replace(/\/+$/, ""),
		apiKey: (env.LITELLM_API_KEY ?? "").trim(),
		modelo: env.TRANSCRICAO_MODELO?.trim() || MODELO_ASR_PADRAO,
		timeoutMs: TRANSCRICAO_TIMEOUT_MS,
	};
}

/**
 * Transcreve o áudio pelo gateway.
 *
 * `POST {base}/asr/qwen` com o corpo do `input_audio` (data-URI base64) — o
 * passthrough do LiteLLM repassa verbatim ao DashScope e devolve o JSON do
 * provedor; o texto está em `choices[0].message.content`.
 */
export async function transcrever(
	bytes: Uint8Array,
	mimeType: string,
	over: Partial<TranscricaoDeps> = {},
): Promise<TranscricaoResultado> {
	const deps = { ...defaultTranscricaoDeps(), ...over };
	const inicio = Date.now();

	const base = deps.baseUrl || baseDoHost(await (deps.resolverGateway ?? resolveGatewayHost)());
	if (!base) {
		throw new TranscricaoFalhouError(
			"gateway não resolvido (sem LITELLM_BASE_URL e sem LITELLM_SRV_NAME)",
		);
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), deps.timeoutMs);

	try {
		const dataUri = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;

		const resposta = await deps.fetch(`${base}${CAMINHO_DO_ASR}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${deps.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: deps.modelo,
				messages: [
					{
						role: "user",
						content: [{ type: "input_audio", input_audio: { data: dataUri } }],
					},
				],
				asr_options: { language: IDIOMA },
			}),
			signal: controller.signal,
		});

		if (!resposta.ok) {
			throw new TranscricaoFalhouError(`gateway respondeu ${resposta.status}`);
		}

		const json = (await resposta.json()) as {
			choices?: Array<{ message?: { content?: unknown } }>;
		};
		const bruto = json.choices?.[0]?.message?.content;
		const texto = typeof bruto === "string" ? bruto.trim() : "";
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
