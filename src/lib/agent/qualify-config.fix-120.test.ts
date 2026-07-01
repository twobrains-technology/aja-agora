// Camada 1 (FIX-120 / D5) — CONTRATO: o gate credit é CONVERSA nos dois canais.
//
// O contrato do bloco-jornada-entrada (qualify-config.ts) já classificava o gate
// credit como "conversation" (FIX-105). O FIX-120 fecha o wiring do WhatsApp
// (o adapter parou de mandar a lista de faixas). Este teste trava o contrato +
// o reuso do backstop determinístico parseAssetValue (FIX-115).

import { describe, expect, it } from "vitest";
import { parseAssetValue } from "@/lib/agent/parse-asset-value";
import { QUALIFY_GATE_INPUT_KIND } from "@/lib/agent/qualify-config";

describe("FIX-120 — contrato: gate credit = conversa (não botão/lista)", () => {
	it("QUALIFY_GATE_INPUT_KIND.credit === 'conversation'", () => {
		expect(QUALIFY_GATE_INPUT_KIND.credit).toBe("conversation");
	});

	it("parseAssetValue é o backstop conversacional (formas comuns do usuário)", () => {
		expect(parseAssetValue("uns 80 mil")).toBe(80_000);
		expect(parseAssetValue("1,5 milhão")).toBe(1_500_000);
		expect(parseAssetValue("R$ 50.000")).toBe(50_000);
		// número NU pequeno é ambíguo demais → deixa pro analyzer (null)
		expect(parseAssetValue("80")).toBeNull();
		// orçamento mensal NUNCA é lido como valor do bem
		expect(parseAssetValue("850 por mês")).toBeNull();
	});
});
