// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { empurrarMarcosNoDataLayer } from "./data-layer";

const CONVERSA = "conv-1";

function marcos(...itens: Array<Record<string, unknown>>) {
	return {
		ok: true,
		json: async () => ({ eventos: itens }),
	} as unknown as Response;
}

describe("marcos no dataLayer", () => {
	beforeEach(() => {
		(window as unknown as { dataLayer?: unknown[] }).dataLayer = [];
		window.sessionStorage.clear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function fila() {
		return (window as unknown as { dataLayer: Array<Record<string, unknown>> }).dataLayer;
	}

	it("empurra o marco com o event_id que o servidor mandou", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				marcos({ event: "lead", event_id: "lead:abc:lead", journey_stage: "lead" }),
			),
		);

		await empurrarMarcosNoDataLayer(CONVERSA);

		expect(fila()).toEqual([{ event: "lead", event_id: "lead:abc:lead", journey_stage: "lead" }]);
	});

	// O componente do chat remonta várias vezes numa sessão. Sem dedup, o mesmo
	// `lead` iria ao dataLayer a cada remontagem e o GTM dispararia de novo.
	it("não empurra duas vezes o mesmo marco, mesmo chamando de novo", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				marcos({ event: "lead", event_id: "lead:abc:lead", journey_stage: "lead" }),
			),
		);

		await empurrarMarcosNoDataLayer(CONVERSA);
		await empurrarMarcosNoDataLayer(CONVERSA);

		expect(fila()).toHaveLength(1);
	});

	it("empurra só o que é novo quando a jornada avança", async () => {
		const lead = { event: "lead", event_id: "lead:abc:lead", journey_stage: "lead" };
		const compra = {
			event: "purchase",
			event_id: "lead:abc:purchase:p1",
			journey_stage: "purchase",
			transaction_id: "p1",
			value: 150000,
			currency: "BRL",
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(marcos(lead))
			.mockResolvedValueOnce(marcos(lead, compra));
		vi.stubGlobal("fetch", fetchMock);

		await empurrarMarcosNoDataLayer(CONVERSA);
		const novos = await empurrarMarcosNoDataLayer(CONVERSA);

		expect(novos).toBe(1);
		expect(fila()).toEqual([lead, compra]);
	});

	it("cria o dataLayer quando o GTM ainda não criou", async () => {
		(window as unknown as { dataLayer?: unknown[] }).dataLayer = undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				marcos({ event: "lead", event_id: "lead:abc:lead", journey_stage: "lead" }),
			),
		);

		await empurrarMarcosNoDataLayer(CONVERSA);

		expect(fila()).toHaveLength(1);
	});

	// Medir nunca derruba o produto: rede caída não pode estourar no chat.
	it("engole falha de rede sem lançar", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);

		await expect(empurrarMarcosNoDataLayer(CONVERSA)).resolves.toBe(0);
		expect(fila()).toHaveLength(0);
	});

	it("sem conversa não chama nada", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		expect(await empurrarMarcosNoDataLayer("")).toBe(0);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
