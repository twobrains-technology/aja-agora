// FIX-246 (rodada 3, Fable r2 — causa-raiz): two_paths/embedded_bid/scarcity
// dependiam do LLM obedecer um directive pra chamar present_X — 0 emissões em
// 7 oportunidades ao vivo (veredito). SOLUÇÃO: emissão SERVER-SIDE
// DETERMINÍSTICA — o handler monta o payload coagido a partir do
// `meta.recommendedOffer` (mesma coerção do runner.ts), sem tool-call nenhuma.
// Lei 1 (LLM não dirige o fluxo) + Lei 4 (invariante crítico vira código).

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildEmbeddedBidCard, buildScarcityCard, buildTwoPathsCard } from "./server-cards";

const META_COM_OFERTA: ConversationMetadata = {
	recommendedAdministradora: "CANOPUS",
	recommendedOffer: {
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 90_000,
		termMonths: 72,
		monthlyPayment: 812,
		maxEmbutidoPct: 30,
		groupId: "grupo-real-abc",
	},
};

describe("buildTwoPathsCard — emissão determinística (sem tool-call)", () => {
	it("monta o payload a partir da oferta real do meta", () => {
		const card = buildTwoPathsCard(META_COM_OFERTA);
		expect(card.payload.administradora).toBe("CANOPUS");
		expect(card.payload.monthlyPayment).toBe(812);
		expect(typeof card.payload.disclaimer).toBe("string");
	});

	it("sem oferta ancorada, ainda retorna payload seguro (nunca lança)", () => {
		const card = buildTwoPathsCard({});
		expect(card.payload).toBeDefined();
	});
});

describe("buildEmbeddedBidCard — emissão determinística (sem tool-call)", () => {
	it("monta o payload a partir da oferta real do meta (crédito líquido menor que a carta)", () => {
		const card = buildEmbeddedBidCard(META_COM_OFERTA);
		expect(card.payload.creditValue).toBe(90_000);
		expect(card.payload.embeddedBidValue).toBeCloseTo(27_000, 0);
		expect(card.payload.netCredit).toBeCloseTo(63_000, 0);
		expect(String(card.payload.disclaimer)).toMatch(/crédito recebido diminui/i);
	});

	it("sem oferta ancorada, ainda retorna payload seguro (nunca lança)", () => {
		const card = buildEmbeddedBidCard({});
		expect(card.payload).toBeDefined();
	});
});

describe("buildScarcityCard — emissão determinística (sem tool-call)", () => {
	it("resolve availableSlots a partir do groupId real persistido no meta.recommendedOffer", () => {
		const card = buildScarcityCard(META_COM_OFERTA);
		expect(card).not.toBeNull();
		expect(card?.payload.groupCode).toBe("grupo-real-abc");
		expect(card?.payload.administradora).toBe("CANOPUS");
		expect(typeof card?.payload.availableSlots).toBe("number");
	});

	it("é DETERMINÍSTICO — o mesmo groupId sempre produz o mesmo availableSlots", () => {
		const a = buildScarcityCard(META_COM_OFERTA);
		const b = buildScarcityCard(META_COM_OFERTA);
		expect(a?.payload.availableSlots).toBe(b?.payload.availableSlots);
	});

	it("sem groupId ancorado no meta, NÃO fabrica — retorna null (nada a emitir)", () => {
		const semGroupId: ConversationMetadata = {
			recommendedOffer: {
				administradora: "CANOPUS",
				creditValue: 90_000,
				termMonths: 72,
				monthlyPayment: 812,
			},
		};
		expect(buildScarcityCard(semGroupId)).toBeNull();
	});

	it("sem oferta nenhuma no meta, retorna null", () => {
		expect(buildScarcityCard({})).toBeNull();
	});
});
