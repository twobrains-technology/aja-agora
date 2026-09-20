// Unit — a chamada crua ao gateway de transcrição (AJA-15).
//
// Nenhum teste aqui toca a rede: `fetch` é sempre fake. O que se prova é o
// contrato com o LiteLLM (rota, multipart, modelo, idioma, bearer), o erro
// tipado e o timeout.

import { describe, expect, it, vi } from "vitest";
import {
	defaultTranscricaoDeps,
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
		modelo: "whisper-1",
		timeoutMs: TRANSCRICAO_TIMEOUT_MS,
		...over,
	};
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
	it("modelo default whisper-1 e base sem barra final", () => {
		const d = defaultTranscricaoDeps({ LITELLM_BASE_URL: "http://x:4000/" });
		expect(d.modelo).toBe("whisper-1");
		expect(d.baseUrl).toBe("http://x:4000");
	});
	it("TRANSCRICAO_MODELO sobrepõe o default", () => {
		expect(defaultTranscricaoDeps({ TRANSCRICAO_MODELO: "whisper-large-v3" }).modelo).toBe(
			"whisper-large-v3",
		);
	});
});

describe("transcrever", () => {
	it("200 com {text} → texto, modelo e duração; multipart com model e language=pt", async () => {
		const fetchFake = vi.fn(
			async () =>
				new Response(JSON.stringify({ text: "  quero uma cota de moto  " }), { status: 200 }),
		);
		const d = deps({ fetch: fetchFake as unknown as typeof fetch });

		const r = await transcrever(BYTES, "audio/ogg", d);

		expect(r.texto).toBe("quero uma cota de moto");
		expect(r.modelo).toBe("whisper-1");
		expect(r.duracaoMs).toBeGreaterThanOrEqual(0);

		const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("http://gateway.local:4000/audio/transcriptions");
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-teste");
		const form = init.body as FormData;
		expect(form.get("model")).toBe("whisper-1");
		expect(form.get("language")).toBe("pt");
		expect(form.get("file")).toBeInstanceOf(Blob);
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
			fetch: (async () =>
				new Response(JSON.stringify({ text: "   " }), { status: 200 })) as unknown as typeof fetch,
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

	it("sem LITELLM_BASE_URL → falha tipada (fail-safe, nunca chama rede)", async () => {
		const fetchFake = vi.fn() as unknown as typeof fetch;
		const d = deps({ fetch: fetchFake, baseUrl: "" });
		await expect(transcrever(BYTES, "audio/ogg", d)).rejects.toThrow(/BASE_URL/);
		expect(fetchFake).not.toHaveBeenCalled();
	});
});
