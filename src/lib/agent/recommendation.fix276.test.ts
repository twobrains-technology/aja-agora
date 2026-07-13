import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import { rankGroups, type ScoringInput } from "./recommendation";

// ============================================================================
// FIX-276 (QA do dono, 2026-07-11 — conversa f6c5aec0): pedido de R$ 120.000
// (creta 2023) recomendou ITAÚ R$ 150.000 (25% acima do pedido, parcela 64%
// maior) em vez do BB R$ 120.000 exato. Root cause: `recommend_groups` exige
// `budget` mensal que o usuário NUNCA informa — o LLM inventa — e
// `monthlyFitScore` (peso 0.4) premiava a carta de parcela maior quando o
// budget inventado favorecia ela. Risco CDC: recomendar carta mais cara que
// o valor do bem pedido corrói confiança e pega mal regulatoriamente.
//
// Fix: `creditProximityScore` ancora o ranking no valor do bem PEDIDO
// (`creditMax`, dado REAL — o usuário sempre informa o que quer comprar),
// não no budget mensal (fabricado). Vira o fator dominante (peso 0.4);
// monthlyFit perde peso (0.4 → 0.15) mas não desaparece.
//
// Cada cenário abaixo usa o PIOR caso pra este fix: o `budget` (inventado)
// casa EXATAMENTE a parcela da carta mais cara — o máximo que monthlyFit
// pode favorecer a opção que fica acima do pedido. Mesmo assim, a carta que
// bate o valor pedido tem que vencer.
// ============================================================================

function g(over: Partial<GroupSummary> & Pick<GroupSummary, "id" | "creditValue">): GroupSummary {
	return {
		administradora: "A",
		category: "auto",
		monthlyPayment: 0,
		adminFeePercent: 15,
		termMonths: 80,
		totalParticipants: 0,
		availableSlots: 0,
		contemplationRate: 5,
		...over,
	};
}

describe("FIX-276 — rankGroups ancora no valor do bem pedido (creditMax), não no budget inventado", () => {
	const scenarios = [
		{ creditMax: 80_000, cheapPayment: 1_300, expensiveCreditValue: 100_000, expensivePayment: 2_275 },
		{ creditMax: 120_000, cheapPayment: 2_000, expensiveCreditValue: 150_000, expensivePayment: 3_500 },
		{ creditMax: 250_000, cheapPayment: 4_000, expensiveCreditValue: 312_500, expensivePayment: 7_000 },
	];

	for (const { creditMax, cheapPayment, expensiveCreditValue, expensivePayment } of scenarios) {
		it(`creditMax=${creditMax}: carta == pedido vence carta ${expensiveCreditValue} (25% acima) mesmo com budget inventado casando a parcela mais cara`, () => {
			const noPedido = g({
				id: "no-pedido",
				administradora: "BANCO DO BRASIL",
				creditValue: creditMax,
				monthlyPayment: cheapPayment,
			});
			const acimaDoPedido = g({
				id: "acima-do-pedido",
				administradora: "ITAÚ",
				creditValue: expensiveCreditValue,
				monthlyPayment: expensivePayment,
			});
			const input: ScoringInput = {
				// Pior caso: o budget "inventado" pelo LLM casa EXATAMENTE a parcela
				// da carta mais cara (monthlyFit dela vai ao teto, 1.0).
				budget: expensivePayment,
				desiredTermMonths: 0,
				creditMax,
			};
			const ranked = rankGroups([acimaDoPedido, noPedido], input);
			expect(ranked[0].group.id).toBe("no-pedido");
			expect(ranked[0].group.creditValue).toBe(creditMax);
			expect(ranked[0].group.creditValue).toBeLessThanOrEqual(creditMax);
		});
	}

	it("sem creditMax (busca sem faixa) → creditProximity neutro, não distorce o ranking", () => {
		const a = g({ id: "a", creditValue: 100_000, monthlyPayment: 1_000, contemplationRate: 8 });
		const b = g({ id: "b", creditValue: 500_000, monthlyPayment: 5_000, contemplationRate: 8 });
		const input: ScoringInput = { budget: 1_000, desiredTermMonths: 0 };
		const ranked = rankGroups([a, b], input);
		// Sem âncora, os dois recebem creditProximity=0.5 (empatam nesse fator) —
		// o resto do score decide, sem lançar exceção nem preferir um por default.
		expect(ranked).toHaveLength(2);
		expect(ranked[0].factors.creditProximity).toBe(0.5);
		expect(ranked[1].factors.creditProximity).toBe(0.5);
	});
});
