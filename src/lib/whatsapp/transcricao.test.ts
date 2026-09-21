// Unit — a chamada crua ao gateway de transcrição (AJA-15).
//
// Nenhum teste aqui toca a rede: `fetch` é sempre fake e a resolução do gateway
// é injetada. O que se prova é o contrato com o LiteLLM (rota de passthrough,
// corpo do input_audio, data-URI, idioma, bearer), o erro tipado e o timeout.
//
// O caminho de PRODUÇÃO tem um teste próprio (`baseUrl` vazio + host do SRV):
// foi exatamente aí que a primeira versão desta feature morria — o container de
// prod não tem `LITELLM_BASE_URL` e o código antigo exigia a variável.

import { describe, expect, it, vi } from "vitest";
import {
	CAMINHO_DO_ASR,
	defaultTranscricaoDeps,
	MODELO_ASR_PADRAO,
	TRANSCRICAO_TIMEOUT_MS,
	type TranscricaoDeps,
	TranscricaoFalhouError,
	transcrever,
	transcricaoAtiva,
} from "./transcricao";

const BYTES = new Uint8Array([1, 2, 3, 4]);

function deps(over: Partial<TranscricaoDeps> = {}): TranscricaoDeps {
	return {
		fetch: vi.fn() as unknown as typeof fetch,
		baseUrl: "http://gateway.local:4000",
		apiKey: "sk-teste",
		modelo: MODELO_ASR_PADRAO,
		timeoutMs: TRANSCRICAO_TIMEOUT_MS,
		// Por padrão o teste não resolve SRV: quem manda é o `baseUrl` acima.
		resolverGateway: async () => null,
		...over,
	};
}

/** Resposta do provedor, no formato que o passthrough devolve verbatim. */
function respostaComTexto(texto: string): Response {
	return new Response(
		JSON.stringify({ choices: [{ message: { content: texto, role: "assistant" } }] }),
		{ status: 200 },
	);
}

describe("transcricaoAtiva — nasce desligada", () => {
	it("só liga com o valor exatamente 'true'", () => {
		expect(transcricaoAtiva({})).toBe(false);
		expect(transcricaoAtiva({ TRANSCRICAO_AUDIO_ATIVA: "" })).toBe(false);
		expect(transcricaoAtiva({ TRANSCRICAO_AUDIO_ATIVA: "1" })).toBe(false);
		expect(transcricaoAtiva({ TRANSCRICAO_AUDIO_ATIVA: "sim" })).toBe(false);
		expect(transcricaoAtiva({ TRANSCRICAO_AUDIO_ATIVA: "TRUE" })).toBe(true);
	});
});

describe("defaultTranscricaoDeps", () => {
	it("modelo default é o do Qwen e a base perde a barra final", () => {
		const d = defaultTranscricaoDeps({ LITELLM_BASE_URL: "http://x:4000/" });
		expect(d.modelo).toBe(MODELO_ASR_PADRAO);
		expect(d.baseUrl).toBe("http://x:4000");
	});
	it("TRANSCRICAO_MODELO sobrepõe o default", () => {
		expect(defaultTranscricaoDeps({ TRANSCRICAO_MODELO: "qwen-outro-asr" }).modelo).toBe(
			"qwen-outro-asr",
		);
	});
	it("modelo vazio cai no default (vazio ≠ ausente é o footgun do compose)", () => {
		expect(defaultTranscricaoDeps({ TRANSCRICAO_MODELO: "" }).modelo).toBe(MODELO_ASR_PADRAO);
	});
});

describe("transcrever", () => {
	it("200 → texto, modelo e duração; corpo do input_audio com data-URI e idioma pt", async () => {
		const fetchFake = vi.fn(async () => respostaComTexto("  quero uma cota de moto  "));
		const d = deps({ fetch: fetchFake as unknown as typeof fetch });

		const r = await transcrever(BYTES, "audio/ogg", d);

		expect(r.texto).toBe("quero uma cota de moto");
		expect(r.modelo).toBe(MODELO_ASR_PADRAO);
		expect(r.duracaoMs).toBeGreaterThanOrEqual(0);

		const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(`http://gateway.local:4000${CAMINHO_DO_ASR}`);
		expect(init.method).toBe("POST");
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer sk-teste");
		expect(headers["Content-Type"]).toBe("application/json");

		const corpo = JSON.parse(String(init.body)) as {
			model: string;
			messages: Array<{ content: Array<{ type: string; input_audio: { data: string } }> }>;
			asr_options: { language: string };
		};
		expect(corpo.model).toBe(MODELO_ASR_PADRAO);
		expect(corpo.asr_options.language).toBe("pt");
		const bloco = corpo.messages[0].content[0];
		expect(bloco.type).toBe("input_audio");
		expect(bloco.input_audio.data.startsWith("data:audio/ogg;base64,")).toBe(true);
		// O áudio vai inteiro, em base64, e decodifica de volta nos mesmos bytes.
		const b64 = bloco.input_audio.data.replace("data:audio/ogg;base64,", "");
		expect(new Uint8Array(Buffer.from(b64, "base64"))).toEqual(BYTES);
	});

	it("PRODUÇÃO: sem LITELLM_BASE_URL, resolve o host pelo SRV e usa o mesmo caminho", async () => {
		const fetchFake = vi.fn(async () => respostaComTexto("do gateway por SRV"));
		const d = deps({
			fetch: fetchFake as unknown as typeof fetch,
			baseUrl: "",
			resolverGateway: async () => "10.30.1.98:4000",
		});

		const r = await transcrever(BYTES, "audio/ogg", d);

		expect(r.texto).toBe("do gateway por SRV");
		const [url] = fetchFake.mock.calls[0] as unknown as [string];
		expect(url).toBe(`http://10.30.1.98:4000${CAMINHO_DO_ASR}`);
	});

	it("resposta não-ok → TranscricaoFalhouError com o status", async () => {
		const d = deps({
			fetch: (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch,
		});
		await expect(transcrever(BYTES, "audio/ogg", d)).rejects.toBeInstanceOf(TranscricaoFalhouError);
		await expect(transcrever(BYTES, "audio/ogg", d)).rejects.toThrow(/404/);
	});

	it("texto vazio → TranscricaoFalhouError (não vira fala vazia)", async () => {
		const d = deps({
			fetch: (async () => respostaComTexto("   ")) as unknown as typeof fetch,
		});
		await expect(transcrever(BYTES, "audio/ogg", d)).rejects.toThrow(/vazio/);
	});

	it("estourou o timeout → TranscricaoFalhouError de timeout", async () => {
		const fetchFake = ((_url: string, init?: RequestInit) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(new DOMException("aborted", "AbortError")),
				);
			})) as unknown as typeof fetch;
		const d = deps({ fetch: fetchFake, timeoutMs: 5 });
		await expect(transcrever(BYTES, "audio/ogg", d)).rejects.toThrow(/timeout/);
	});

	it("sem base e sem SRV → falha tipada (fail-safe, nunca chama rede)", async () => {
		const fetchFake = vi.fn() as unknown as typeof fetch;
		const d = deps({ fetch: fetchFake, baseUrl: "", resolverGateway: async () => null });
		await expect(transcrever(BYTES, "audio/ogg", d)).rejects.toThrow(/gateway não resolvido/);
		expect(fetchFake).not.toHaveBeenCalled();
	});
});
