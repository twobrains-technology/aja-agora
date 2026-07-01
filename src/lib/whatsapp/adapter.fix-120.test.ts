// Camada 1 (FIX-120 / D5) — PARIDADE FIX-115: valor do bem por CONVERSA.
//
// Jornada canônica (Passo 2): "Valor do bem — só o valor". No web é a agulha
// simples (FIX-115) que sem onSubmit manda o valor como texto livre; o backstop
// parseAssetValue garante o avanço. No WhatsApp o gate credit deve PERGUNTAR o
// valor por texto e OUVIR a resposta livre — sem lista de faixas. Este teste
// trava: fireGate("credit") envia a pergunta como TEXTO (espelhando o identify),
// não uma lista interativa de faixas; e parseAssetValue captura a resposta livre.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAssetValue } from "@/lib/agent/parse-asset-value";

const CONV_ID = "conv-adapter-fix120";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	reloadMeta: vi.fn(),
}));

vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("@/lib/conversation/meta", () => ({
	persistMeta: mocks.persistMeta,
	reloadMeta: mocks.reloadMeta,
}));

import { fireGate } from "./adapter";

beforeEach(() => {
	for (const m of [mocks.sendText, mocks.sendInteractive, mocks.persistMeta]) m.mockClear();
	mocks.reloadMeta.mockResolvedValue({ currentCategory: "auto" });
});

afterEach(() => vi.clearAllMocks());

describe("FIX-120 — gate credit no WhatsApp pergunta o valor por TEXTO (paridade FIX-115)", () => {
	it("fireGate('credit') envia a pergunta do valor como TEXTO, não lista de faixas", async () => {
		await fireGate(WA, CONV_ID, "credit", { currentCategory: "auto" } as never);
		// pergunta textual conversacional (gateQuestion('credit'))
		expect(mocks.sendText).toHaveBeenCalledTimes(1);
		expect(mocks.sendText.mock.calls[0]?.[1]).toMatch(/valor do bem/i);
		// NÃO manda lista interativa de faixas
		expect(mocks.sendInteractive).not.toHaveBeenCalled();
	});

	it("fireGate('credit') com prefix embute o prefixo antes da pergunta", async () => {
		await fireGate(WA, CONV_ID, "credit", { currentCategory: "auto" } as never, "Boa!");
		expect(mocks.sendText).toHaveBeenCalledTimes(1);
		const text = mocks.sendText.mock.calls[0]?.[1] as string;
		expect(text).toContain("Boa!");
		expect(text).toMatch(/valor do bem/i);
		expect(mocks.sendInteractive).not.toHaveBeenCalled();
	});

	it("nenhum texto do gate credit menciona 'Faixas de valor do bem' (lista aposentada)", async () => {
		await fireGate(WA, CONV_ID, "credit", { currentCategory: "imovel" } as never);
		for (const call of mocks.sendText.mock.calls) {
			expect(call[1]).not.toMatch(/Faixas de valor do bem/i);
		}
		expect(mocks.sendInteractive).not.toHaveBeenCalled();
	});

	it("reuso parseAssetValue: a resposta livre 'uns 80 mil' vira 80000 (pipeline conversacional)", () => {
		expect(parseAssetValue("uns 80 mil")).toBe(80_000);
		expect(parseAssetValue("50k")).toBe(50_000);
		expect(parseAssetValue("R$ 240.000")).toBe(240_000);
	});
});
