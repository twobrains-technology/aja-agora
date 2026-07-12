// Camada 1 (FIX-25) — derivação do input do startContract. Módulo ÚNICO
// consumido por web (route.ts) e WhatsApp (contract-capture.ts): a mesma
// proposta real sai dos dois canais com os mesmos parâmetros.

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import {
	administradoraConflictsWithRegisteredProposal,
	buildStartContractInput,
} from "./contract-input";

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

	// FIX-251 (P0, veredito Fable FINAL §N-A, 2026-07-10): defesa em profundidade
	// do fechamento. Sequência real (Fluxo B):
	//  1. Reveal recomenda RODOBENS 90.000 / R$ 1.218,92.
	//  2. What-if "quero a ITAÚ" → 161.258 — o runner (à época) re-ancorava
	//     meta.recommendedOffer no artifact do what-if.
	//  3. Usuário REJEITA e reconfirma RODOBENS por texto (sem nova tool-call —
	//     sem novo simulation_result pra re-ancorar).
	//  4. contract-submit usava valor = meta.recommendedOffer.creditValue =
	//     161.258 (a oferta STALE vencia o creditMax falado) → clamp de 20%
	//     EXCLUÍA a RODOBENS 90k (-44%) e fechava ITAU 161.258 — proposta REAL
	//     errada na Bevi, 79% acima do pedido.
	// O runner (runner.ts, contract_form + what-if) já re-ancora os dois campos
	// JUNTOS nos caminhos cobertos — este bloco é a defesa em profundidade pra
	// qualquer caminho não coberto: se administradora/offer divergirem, NUNCA
	// usa o creditValue de uma administradora abandonada.
	describe("FIX-251 — nunca usa creditValue de administradora abandonada (defesa em profundidade)", () => {
		it("recommendedOffer (ITAÚ, stale) diverge de recommendedAdministradora (RODOBENS, confirmada) → cai pro creditMax, NUNCA 161.258", () => {
			const meta: ConversationMetadata = {
				currentCategory: "auto",
				qualifyAnswers: { creditMax: 90000 },
				recommendedOffer: {
					administradora: "ITAU",
					creditValue: 161258,
					termMonths: 200,
					monthlyPayment: 2984.38,
				},
				recommendedAdministradora: "RODOBENS",
			} as ConversationMetadata;

			const input = buildStartContractInput(meta, { ...identity, lgpd: true });

			expect(input.valor).not.toBe(161258);
			expect(input.valor).toBe(90000);
			expect(input.administradoraPreferida).toBe("RODOBENS");
			expect(input.prazoPreferido).toBeNull();
		});

		it("administradora/offer CONSISTENTES (fluxo normal) → usa o snapshot normalmente", () => {
			const meta: ConversationMetadata = {
				currentCategory: "auto",
				qualifyAnswers: { creditMax: 90000 },
				recommendedOffer: {
					administradora: "RODOBENS",
					creditValue: 90000,
					termMonths: 180,
					monthlyPayment: 1218.92,
				},
				recommendedAdministradora: "RODOBENS",
			} as ConversationMetadata;

			const input = buildStartContractInput(meta, { ...identity, lgpd: true });

			expect(input.valor).toBe(90000);
			expect(input.prazoPreferido).toBe(180);
		});

		it("acento/caixa não disparam falso-positivo de divergência (ITAÚ === Itau)", () => {
			const meta: ConversationMetadata = {
				currentCategory: "auto",
				qualifyAnswers: {},
				recommendedOffer: {
					administradora: "Itau",
					creditValue: 161258,
					termMonths: 200,
					monthlyPayment: 2984.38,
				},
				recommendedAdministradora: "ITAÚ",
			} as ConversationMetadata;

			const input = buildStartContractInput(meta, { ...identity, lgpd: true });

			expect(input.valor).toBe(161258);
			expect(input.prazoPreferido).toBe(200);
		});
	});

	// FIX-281 (r9 onda 2, veredito Sonnet r9pos, gap G-A): o `rawCreditValue` que
	// alimenta o aviso de divergência CDC no `real_offer` (card do fechamento) vinha
	// de `valor` — que é o `creditValue` da ÚLTIMA oferta vista (correto só pro
	// matching, FIX-73), NUNCA o pedido ORIGINAL do cliente. Isso silenciava
	// (mario: pedido≈oferta, aviso nunca dispara) ou sub-representava (madalena: o
	// aviso comparava contra o creditValue do reveal, não o pedido real) a
	// divergência. Campo NOVO e independente, MESMA âncora do hero
	// (runner.ts:656-665, FIX-261): `creditClampedFrom ?? creditMax`.
	describe("FIX-281 — originalRequestedCreditValue: âncora do aviso CDC do fechamento", () => {
		it("popula a partir de creditClampedFrom ?? creditMax, NUNCA de recommendedOffer.creditValue (pedido e oferta DIVERGEM)", () => {
			const meta: ConversationMetadata = {
				currentCategory: "auto",
				recommendedAdministradora: "ÂNCORA",
				qualifyAnswers: {
					creditMax: 250_000,
					creditClampedFrom: 250_000,
					objetivo: "contemplacao_rapida",
				},
				recommendedOffer: {
					administradora: "ÂNCORA",
					category: "auto",
					creditValue: 260_173, // creditValue do REVEAL anterior — diverge do pedido
					termMonths: 200,
					monthlyPayment: 3271.5,
				},
			} as ConversationMetadata;

			const input = buildStartContractInput(meta, { ...identity, lgpd: true });

			// `valor` (matching da oferta, FIX-73) continua intocado — usa a oferta real.
			expect(input.valor).toBe(260_173);
			// o campo NOVO carrega o pedido ORIGINAL — nunca o creditValue da oferta.
			expect(input.originalRequestedCreditValue).toBe(250_000);
		});

		it("prefere creditClampedFrom sobre creditMax quando os dois existem (mesma precedência do hero, FIX-68)", () => {
			const meta: ConversationMetadata = {
				currentCategory: "auto",
				qualifyAnswers: { creditMax: 300_000, creditClampedFrom: 70_000 },
			} as ConversationMetadata;

			const input = buildStartContractInput(meta, { ...identity, lgpd: true });

			expect(input.originalRequestedCreditValue).toBe(70_000);
		});

		it("sem creditClampedFrom, cai pra creditMax", () => {
			const meta: ConversationMetadata = {
				currentCategory: "auto",
				qualifyAnswers: { creditMax: 90_000 },
			} as ConversationMetadata;

			const input = buildStartContractInput(meta, { ...identity, lgpd: true });

			expect(input.originalRequestedCreditValue).toBe(90_000);
		});
	});
});

// FIX-263 (P1, veredito Fable r5, seam PARCIAL, 2026-07-10) — o anti-refazer
// era REGRA-NO-PROMPT e falhou ao vivo 2×: o agente negou a proposta
// RODOBENS registrada, afirmou falsamente que a ITAÚ estava registrada (sem
// check_proposal_status) e reabriu o contract_form da ITAÚ — a 1 clique de
// uma 2ª proposta REAL (CPF + bureau) na mesma conversa. Este helper puro é o
// guard em CÓDIGO (Lei 1/4): decide se o fechamento em curso CONFLITA com uma
// proposta já registrada — nunca confia no que o modelo afirma.
describe("administradoraConflictsWithRegisteredProposal (FIX-263 — anti-refazer em código)", () => {
	it("conflita quando a administradora pedida diverge da já registrada", () => {
		expect(administradoraConflictsWithRegisteredProposal("RODOBENS", "ITAÚ")).toBe(true);
	});

	it("NÃO conflita quando é a MESMA administradora (retry legítimo, ex.: erro de rede)", () => {
		expect(administradoraConflictsWithRegisteredProposal("RODOBENS", "RODOBENS")).toBe(false);
	});

	it("acento/caixa não disparam falso-positivo (ITAÚ === Itau, mesma regra do FIX-251)", () => {
		expect(administradoraConflictsWithRegisteredProposal("Itau", "ITAÚ")).toBe(false);
	});

	it("sem proposta registrada ainda (null/undefined) → nunca conflita (1ª proposta da conversa)", () => {
		expect(administradoraConflictsWithRegisteredProposal(null, "ITAÚ")).toBe(false);
		expect(administradoraConflictsWithRegisteredProposal(undefined, "ITAÚ")).toBe(false);
	});

	it("sem administradora pedida (defensivo) → nunca conflita (nada pra comparar)", () => {
		expect(administradoraConflictsWithRegisteredProposal("RODOBENS", null)).toBe(false);
		expect(administradoraConflictsWithRegisteredProposal("RODOBENS", undefined)).toBe(false);
	});
});
