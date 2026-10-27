// A CARTA TEM QUE COMPRAR O BEM — o defeito dos prints do dono (27/10, 15:32).
//
// `.orientacao/prints-kairo/1532-lance-embutido.png`: o cliente quer o Corolla de R$ 160 mil;
// o agente aplicou 30% de lance embutido NA CARTA DE R$ 160 mil e o card mostrou "você recebe
// R$ 112.000" — dinheiro que não compra o carro, com o próprio card dizendo que era preciso
// "um grupo de carta maior". O servidor deixava montar esse card; agora não deixa: devolve a
// conta pronta e o caminho certo (buscar de novo com embutido, que já procura a carta maior).
//
// `paramsDaBusca` já sabia a conta (bem / (1 − 30%) = 228.571 para um bem de 160 mil) — o que
// faltava era o CARD recusar a carta pequena. Remova a guarda e estes testes ficam vermelhos.

import { describe, expect, it, vi } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";

vi.mock("@/lib/conversation/identity", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/conversation/identity")>()),
	loadIdentity: async () => ({ cpf: "52998224725", celular: "" }),
}));

import { type ContextoDeFato, montarCardDeFato } from "./cards-livres";
import { paramsDaBusca } from "./tools-livres";

function carta(creditValue: number, id: string): GroupSummary {
	return {
		id,
		administradora: "CANOPUS",
		category: "auto",
		adminFeePercent: 17,
		totalParticipants: 1_200,
		availableSlots: 3,
		creditValue,
		monthlyPayment: 1_100,
		adminFee: 13_600,
		reserveFund: 800,
		insurance: 640,
		totalCost: 118_518,
		termMonths: 96,
		effectiveRate: 0.481,
		lanceScenario: { lancePercent: 30, expectedTermMonths: 44 },
		embeddedBid: {
			percent: 30,
			embeddedBidValue: Math.round(creditValue * 0.3),
			receivedCredit: Math.round(creditValue * 0.7),
			necessaryBidToContemplate: 19_800,
		},
		expectedAdjustment: { index: "IPCA", annualPercent: 4.5 },
	} as GroupSummary;
}

function ctxDeFato(grupo: GroupSummary, valorDoBem: number): ContextoDeFato {
	return {
		conversationId: "conv-embutido",
		channel: "web",
		nomeDoCliente: "Marina",
		grupos: new Map([[grupo.id, grupo]]),
		valorDoBem,
	};
}

describe("lance embutido só em carta que sobra o valor do bem", () => {
	it("carta igual ao bem é RECUSADA, com a conta e o caminho certo", async () => {
		const pequena = carta(160_000, "canopus-160");
		const r = await montarCardDeFato(
			"embedded_bid",
			ctxDeFato(pequena, 160_000),
			{ groupId: pequena.id, lancePercent: 30 },
			{ logos: new Map() },
		);

		expect(r.ok).toBe(false);
		if (r.ok) throw new Error("o card não podia sair");
		// A conta que o cliente precisa ver: sobrariam 112 mil, faltariam 48 mil.
		expect(r.erro).toContain("112.000");
		expect(r.erro).toContain("48.000");
		// E o caminho: a carta necessária e a busca com embutido.
		expect(r.erro).toContain("228.571");
		expect(r.erro).toContain("usaraLanceEmbutido: true");
	});

	it("a carta grande (que sobra o bem) passa, com netCredit acima do bem", async () => {
		const grande = carta(228_571, "canopus-229");
		const r = await montarCardDeFato(
			"embedded_bid",
			ctxDeFato(grande, 160_000),
			{ groupId: grande.id, lancePercent: 30 },
			{ logos: new Map() },
		);

		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error(r.erro);
		const payload = r.card.payload as { netCredit: number; cartaNecessaria: number };
		// A carta é arredondada para cima no inteiro: 228.571 × 70% = 159.999,70 — a mesma coisa.
		expect(payload.netCredit).toBeGreaterThanOrEqual(160_000 * 0.995);
		expect(payload.cartaNecessaria).toBe(228_571);
	});

	it("sem valor do bem a carta passa: não há com o que comparar", async () => {
		const grupo = carta(160_000, "canopus-160");
		const r = await montarCardDeFato(
			"embedded_bid",
			{ ...ctxDeFato(grupo, 160_000), valorDoBem: undefined },
			{ groupId: grupo.id, lancePercent: 30 },
			{ logos: new Map() },
		);
		expect(r.ok).toBe(true);
	});

	it("a busca com embutido já procura a carta maior (a conta que a tool faz)", () => {
		const { creditMax, creditMin } = paramsDaBusca({
			categoria: "auto",
			valorDoBem: 160_000,
			usaraLanceEmbutido: true,
		});
		expect(creditMax).toBe(228_571);
		expect(creditMin).toBe(205_714);
	});
});
