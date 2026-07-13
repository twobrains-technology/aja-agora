import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import { rankGroups, type ScoringInput } from "./recommendation";

// ============================================================================
// FIX-219 (Ata 2026-07-04, item 4): a busca agora roda 2x (com/sem lance
// embutido, bevi-self-contract-adapter.ts) e pode trazer o MESMO grupo físico
// (administradora + número) nas duas modalidades — cada uma com números
// diferentes (crédito líquido menor com embutido). O dedup de FIX-193
// (administradora + grupo) não pode colapsar essas duas modalidades numa só:
// a chave passa a incluir `embeddedVariant`.
// ============================================================================

function g(over: Partial<GroupSummary> & Pick<GroupSummary, "id">): GroupSummary {
	return {
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 300_000,
		monthlyPayment: 3_000,
		adminFeePercent: 15,
		termMonths: 96,
		totalParticipants: 0,
		availableSlots: 0,
		contemplationRate: 0,
		...over,
	};
}

const input: ScoringInput = { budget: 3_500, desiredTermMonths: 96 };

describe("FIX-219 — dedup preserva a modalidade com/sem lance embutido", () => {
	it("mesmo grupo (administradora+número) em variantes SEM e COM embutido NÃO colapsa — as duas sobrevivem", () => {
		const groups = [
			g({ id: "q-sem", grupo: "8120", embeddedVariant: "sem" }),
			g({ id: "q-com", grupo: "8120", embeddedVariant: "com", monthlyPayment: 2_200 }),
		];
		const ranked = rankGroups(groups, input);
		expect(ranked).toHaveLength(2);
		expect(ranked.map((r) => r.group.id)).toEqual(expect.arrayContaining(["q-sem", "q-com"]));
	});

	it("mesmo grupo + MESMA variante ainda dedupa (preserva FIX-193 dentro da modalidade)", () => {
		const groups = [
			g({ id: "q-special", grupo: "8120", tipoOferta: "SPECIAL_OFFER", embeddedVariant: "sem" }),
			g({ id: "q-freebid", grupo: "8120", tipoOferta: "FREE_BID", embeddedVariant: "sem" }),
		];
		const ranked = rankGroups(groups, input);
		expect(ranked).toHaveLength(1);
	});

	it("sem embeddedVariant (legado/mesma variante) segue dedupando como antes (FIX-193 intacto)", () => {
		const groups = [
			g({ id: "q-a", grupo: "8120" }),
			g({ id: "q-b", grupo: "8120" }),
		];
		const ranked = rankGroups(groups, input);
		expect(ranked).toHaveLength(1);
	});

	it("administradoras/grupos diferentes com variantes diferentes seguem todos distintos", () => {
		const groups = [
			g({ id: "q-1", grupo: "8120", embeddedVariant: "sem" }),
			g({ id: "q-2", grupo: "8120", embeddedVariant: "com" }),
			g({
				id: "q-3",
				administradora: "BANCO DO BRASIL",
				grupo: "1797",
				embeddedVariant: "sem",
			}),
		];
		const ranked = rankGroups(groups, input);
		expect(ranked).toHaveLength(3);
	});
});
