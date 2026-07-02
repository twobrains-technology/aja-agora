// Camada 1 (FIX-25) — derivação do input do startContract. Módulo ÚNICO
// consumido por web (route.ts) e WhatsApp (contract-capture.ts): a mesma
// proposta real sai dos dois canais com os mesmos parâmetros.

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildStartContractInput } from "./contract-input";

const identity = { cpf: "52998224725", celular: "62999887766" };

describe("buildStartContractInput — derivação canônica (FIX-25, CA-10)", () => {
	it("deriva segmento/valor/objetivo a partir do meta e injeta identidade + lgpd", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			recommendedAdministradora: "ANCORA",
			qualifyAnswers: {
				creditMax: 80000,
				objetivo: "contemplacao_rapida",
			},
		} as ConversationMetadata;

		const input = buildStartContractInput(meta, { ...identity, lgpd: true });

		expect(input.cpf).toBe("52998224725");
		expect(input.celular).toBe("62999887766");
		expect(input.lgpd).toBe(true);
		expect(input.segmento).toBe("AUTOS");
		expect(input.valor).toBe(80000);
		expect(input.objetivo).toBe("contemplacao_rapida");
		expect(input.lanceEmbutido).toBe("nenhum");
		expect(input.administradoraPreferida).toBe("ANCORA");
	});

	// Matching preparatório (2026-06-28): o prazo da oferta vista na Descoberta
	// (snapshot em meta.recommendedOffer) desempata o pickClosestOffer dentro da
	// admin preferida, pra o fechamento não trocar por outro prazo.
	it("propaga prazoPreferido de meta.recommendedOffer.termMonths", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			recommendedAdministradora: "ANCORA",
			recommendedOffer: {
				administradora: "ANCORA",
				category: "auto",
				creditValue: 80000,
				termMonths: 84,
				monthlyPayment: 950,
			},
			qualifyAnswers: { creditMax: 80000 },
		} as ConversationMetadata;
		const input = buildStartContractInput(meta, { ...identity, lgpd: true });
		expect(input.prazoPreferido).toBe(84);
	});

	it("prazoPreferido null quando não há recommendedOffer", () => {
		const meta: ConversationMetadata = { currentCategory: "auto" } as ConversationMetadata;
		const input = buildStartContractInput(meta, { ...identity, lgpd: true });
		expect(input.prazoPreferido).toBeNull();
	});

	it("lanceEmbutido vira percentual string quando o usuário optou", () => {
		const meta: ConversationMetadata = {
			currentCategory: "imovel",
			qualifyAnswers: { creditMin: 120000, lanceEmbutido: true, lanceEmbutidoPercent: 50 },
		} as ConversationMetadata;

		const input = buildStartContractInput(meta, { ...identity, lgpd: true });
		expect(input.segmento).toBe("IMOVEL");
		expect(input.valor).toBe(120000); // cai pra creditMin quando não há creditMax
		expect(input.lanceEmbutido).toBe("50");
	});

	it("defaults seguros quando o meta está vazio (valor 50000, objetivo rápido)", () => {
		const meta: ConversationMetadata = {} as ConversationMetadata;
		const input = buildStartContractInput(meta, { ...identity, lgpd: false });
		expect(input.valor).toBe(50000);
		expect(input.objetivo).toBe("contemplacao_rapida");
		expect(input.lanceEmbutido).toBe("nenhum");
		expect(input.administradoraPreferida).toBeNull();
		expect(input.lgpd).toBe(false);
	});

	// FIX-48 (Camada 1): o caller (route web / WhatsApp) resolve o leadId da
	// conversa e o injeta — sem isso a proposta nasce órfã e a raia trava em
	// `qualificado`. buildStartContractInput precisa PROPAGAR o leadId pro shape.
	it("FIX-48: propaga o leadId resolvido pelo caller pro input do startContract", () => {
		const meta: ConversationMetadata = { currentCategory: "auto" } as ConversationMetadata;
		const input = buildStartContractInput(
			meta,
			{ ...identity, lgpd: true },
			{ leadId: "lead-123" },
		);
		expect(input.leadId).toBe("lead-123");
	});

	it("FIX-48: leadId é null quando o caller não resolve (não vira undefined silencioso)", () => {
		const meta: ConversationMetadata = { currentCategory: "auto" } as ConversationMetadata;
		const input = buildStartContractInput(meta, { ...identity, lgpd: true });
		expect(input.leadId).toBeNull();
	});

	// FIX-73 (QA dono-de-produto 2026-07-02, jornada AUTO web prod): o
	// fechamento re-derivava o valor de q.creditMax (teto pedido pelo usuário,
	// ex.: 100000) em vez de reusar a oferta REAL que o card de recomendação
	// mostrou (ex.: 70000 — a que ele "assinaria"). A Bevi devolvia uma cota
	// NOVA baseada no creditMax, divergindo do que foi anunciado
	// (bait-and-switch). Decisão de produto (Kairo): a proposta contratada
	// usa o MESMO crédito da oferta recomendada persistida em
	// meta.recommendedOffer (snapshot real, FIX-6/FIX-C2) — creditMax só é
	// fallback quando ainda não há oferta (ex.: fechamento sem reveal, embora
	// isso já seja bloqueado a montante pelo guard revealCompleted).
	it("FIX-73: fechamento usa o creditValue da oferta REAL persistida (recommendedOffer), NÃO o creditMax re-derivado", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			recommendedAdministradora: "ÂNCORA",
			qualifyAnswers: { creditMax: 100_000, objetivo: "contemplacao_rapida" },
			recommendedOffer: {
				administradora: "ÂNCORA",
				category: "auto",
				creditValue: 70_000,
				termMonths: 80,
				monthlyPayment: 892.48,
			},
		} as ConversationMetadata;

		const input = buildStartContractInput(meta, { ...identity, lgpd: true });

		expect(input.valor).toBe(70_000);
	});

	it("FIX-73: sem recommendedOffer (defensivo), cai de volta no creditMax/creditMin (comportamento anterior)", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			qualifyAnswers: { creditMax: 100_000 },
		} as ConversationMetadata;

		const input = buildStartContractInput(meta, { ...identity, lgpd: true });
		expect(input.valor).toBe(100_000);
	});
});
