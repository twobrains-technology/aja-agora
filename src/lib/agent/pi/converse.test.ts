// A FALHA DO PROVEDOR NO BEAT — o alerta que a main disparava e o pi engolia.
//
// O pi não lança quando o gateway recusa: ele fecha o beat com `message_end` e
// `stopReason: "error"` (converse.ts:57). Antes deste teste o caso só virava
// `console.error` e o cliente recebia o fallback "me perdi" sem ninguém saber
// que o crédito do gateway acabou — o defeito que custou 29 turnos em
// 01/10/2026 (paridade-310e L27 / P282).
//
// Aqui o gateway é um servidor local que responde 402 com o corpo da Anthropic;
// o alerta é observado pela borda (`registrarFalhaDoLlm`), com I/O desligado.
//
// O mesmo servidor falso serve o caso do USO DE CACHE (L29/P281): o bloco `usage`
// final do stream é o único lugar onde o provedor diz quantos tokens vieram do
// cache do prompt, e o beat precisa devolver esses dois números para o turno.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetarDedupeDeAlerta } from "@/lib/llm/alerta-do-llm";
import { classificarErroDoLlm } from "@/lib/llm/erro-do-llm";
import { executarBeat } from "./converse";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";

const { registrarFalhaDoLlm } = vi.hoisted(() => ({ registrarFalhaDoLlm: vi.fn(async () => {}) }));
vi.mock("@/lib/llm/alerta-do-llm", async (importarOriginal) => {
	const original = await importarOriginal<typeof import("@/lib/llm/alerta-do-llm")>();
	return { ...original, registrarFalhaDoLlm };
});

/** Gateway que RECUSA o turno com o corpo que a Anthropic manda sem crédito. */
async function subirGatewaySemCredito(): Promise<{ url: string; fechar: () => Promise<void> }> {
	const server: Server = createServer((req, res) => {
		req.on("data", () => {});
		req.on("end", () => {
			res.writeHead(402, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					type: "error",
					error: {
						type: "invalid_request_error",
						message:
							"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
					},
				}),
			);
		});
	});
	await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
	const porta = (server.address() as AddressInfo).port;
	return {
		url: `http://127.0.0.1:${porta}`,
		fechar: () => new Promise<void>((ok) => server.close(() => ok())),
	};
}

/** Gateway que responde um beat de texto E o bloco `usage` final do provedor —
 *  é por ali que o cache do prompt chega ao livro-caixa (L29/P281). O bloco vem
 *  em chunk PRÓPRIO, sem `choices`, como a OpenAI (e o gateway atrás do LiteLLM)
 *  manda: `prompt_tokens` já inclui os tokens de cache, então `cached_tokens` e
 *  `cache_write_tokens` são o recorte dele. */
async function subirGatewayComUso(uso: {
	prompt_tokens: number;
	completion_tokens: number;
	cached_tokens?: number;
	cache_write_tokens?: number;
}): Promise<{ url: string; fechar: () => Promise<void> }> {
	const server: Server = createServer((req, res) => {
		req.on("data", () => {});
		req.on("end", () => {
			res.writeHead(200, { "Content-Type": "text/event-stream" });
			const base = {
				id: "chatcmpl-uso",
				object: "chat.completion.chunk",
				created: 0,
				model: "com-uso",
			};
			const envia = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
			envia({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" } }] });
			envia({ ...base, choices: [{ index: 0, delta: { content: "Oi!" } }] });
			envia({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
			envia({
				...base,
				choices: [],
				usage: {
					prompt_tokens: uso.prompt_tokens,
					completion_tokens: uso.completion_tokens,
					prompt_tokens_details: {
						cached_tokens: uso.cached_tokens ?? 0,
						cache_write_tokens: uso.cache_write_tokens ?? 0,
					},
				},
			});
			res.write("data: [DONE]\n\n");
			res.end();
		});
	});
	await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
	const porta = (server.address() as AddressInfo).port;
	return {
		url: `http://127.0.0.1:${porta}`,
		fechar: () => new Promise<void>((ok) => server.close(() => ok())),
	};
}

describe("executarBeat quando o provedor falha", () => {
	beforeEach(() => {
		registrarFalhaDoLlm.mockClear();
		resetarDedupeDeAlerta();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("registra a falha do provedor no alerta operacional", async () => {
		const gateway = await subirGatewaySemCredito();
		const erroLogado = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const beat = await executarBeat({
				system: "você é o vendedor",
				turnMessage: "oi",
				historico: [],
				tools: [],
				provider: {
					id: "litellm",
					baseUrl: gateway.url,
					apiKey: "teste",
					model: "modelo-que-falha",
				},
			});

			// O cliente não perde o turno: o beat volta vazio e o fallback do canal fala.
			expect(beat.texto).toBe("");
			expect(registrarFalhaDoLlm).toHaveBeenCalledTimes(1);
			const [err, contexto] = registrarFalhaDoLlm.mock.calls[0] as unknown as [
				unknown,
				Record<string, unknown>,
			];
			expect(String(err instanceof Error ? err.message : err)).toContain(
				"credit balance is too low",
			);
			// O status HTTP vem no texto do pi e é reconstruído para a classificação.
			expect((err as { statusCode?: number }).statusCode).toBe(402);
			// O que chega na borda é reconhecido como falha de CRÉDITO: é o e-mail +
			// ocorrência no Cortex que a main disparava (e não um "outro" genérico).
			expect(classificarErroDoLlm(err)).toBe("billing");
			expect(contexto).toMatchObject({ origem: "pi/beat" });
			expect(erroLogado).toHaveBeenCalled();
		} finally {
			await gateway.fechar();
		}
	});

	it("beat que dá certo não dispara alerta de falha", async () => {
		const servidor = await subirServidorRoteirizado([{ text: "Oi! Tudo bem?" }]);
		try {
			const beat = await executarBeat({
				system: "você é o vendedor",
				turnMessage: "oi",
				historico: [],
				tools: [],
				provider: {
					id: "litellm",
					baseUrl: servidor.url,
					apiKey: "teste",
					model: "roteirizado",
				},
			});

			expect(beat.texto).toContain("Oi!");
			expect(registrarFalhaDoLlm).not.toHaveBeenCalled();
		} finally {
			await servidor.fechar();
		}
	});
});

// L29/P281 — `TurnTraceRecord.cacheRead`/`cacheWrite` ficavam `null` em TODO turno.
// Os dois leitores existiam (`TurnTrace.setCache` e o `case "usage"` das bordas) e
// ninguém produzia o número: no LangGraph quem emitia o evento era o nó `converse`
// a partir do `usage_metadata` do provedor, e o Pi simplesmente não lia o campo.
describe("executarBeat devolve o uso de CACHE do provedor (L29/P281)", () => {
	it("beat com cache reportado devolve cacheRead e cacheWrite", async () => {
		const gateway = await subirGatewayComUso({
			prompt_tokens: 12000,
			completion_tokens: 40,
			cached_tokens: 10000,
			cache_write_tokens: 500,
		});
		try {
			const beat = await executarBeat({
				system: "você é o vendedor",
				turnMessage: "oi",
				historico: [],
				tools: [],
				provider: {
					id: "litellm",
					baseUrl: gateway.url,
					apiKey: "teste",
					model: "com-uso",
				},
			});

			expect(beat.uso.cacheRead).toBe(10000);
			expect(beat.uso.cacheWrite).toBe(500);
			// Mesma fonte do custo: `input` já vem LÍQUIDO de cache (12000 − 10000 − 500).
			expect(beat.uso.input).toBe(1500);
			expect(beat.uso.output).toBe(40);
		} finally {
			await gateway.fechar();
		}
	});

	it("beat sem cache reportado devolve 0 nos dois campos, como hoje", async () => {
		const servidor = await subirServidorRoteirizado([{ text: "Oi!" }]);
		try {
			const beat = await executarBeat({
				system: "você é o vendedor",
				turnMessage: "oi",
				historico: [],
				tools: [],
				provider: {
					id: "litellm",
					baseUrl: servidor.url,
					apiKey: "teste",
					model: "roteirizado",
				},
			});

			expect(beat.uso).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
		} finally {
			await servidor.fechar();
		}
	});
});
