import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import { rankGroups, type ScoringInput } from "./recommendation";

// ============================================================================
// FIX-56 (jornada2_revisão.docx — teste manual Bernardo, 2026-06-19):
// "Segue aparecendo 2 grupos da mesma Adm". rankGroups ordenava 100% por score
// e fatiava top N sem dedup por administradora — duas ofertas da mesma adm
// entravam juntas. Agora diversifica: no máx 1 por administradora no top N,
// completando com os melhores restantes só se faltar administradora distinta.
// ============================================================================

// Score cresce monotônico com contemplationRate (peso 0.25, linear até 8%);
// demais fatores fixos → ordem de score = ordem de contemplationRate.
function g(id: string, administradora: string, contemplationRate: number): GroupSummary {
	return {
		id,
		administradora,
		category: "auto",
		creditValue: 80_000,
		monthlyPayment: 1_000,
		adminFeePercent: 15,
		termMonths: 60,
		totalParticipants: 400,
		availableSlots: 10,
		contemplationRate,
	};
}

const input: ScoringInput = { budget: 1_200, desiredTermMonths: 60 };

describe("FIX-56 — rankGroups diversifica por administradora", () => {
	it("não repete administradora no top N quando há alternativas distintas", () => {
		const groups = [
			g("porto-1", "Porto", 8), // maior score
			g("porto-2", "Porto", 7), // 2º — mesma adm
			g("itau-1", "Itaú", 6),
			g("brad-1", "Bradesco", 5),
		];
		const top = rankGroups(groups, input, 3);
		const admins = top.map((s) => s.group.administradora);
		expect(admins).toHaveLength(3);
		expect(new Set(admins).size).toBe(3); // todas distintas
		expect(admins).not.toContain(undefined);
		// porto-2 (2º por score, adm repetida) cede lugar a Bradesco
		expect(top.map((s) => s.group.id)).toEqual(["porto-1", "itau-1", "brad-1"]);
	});

	it("preserva o melhor score na 1ª posição (ordenação dentro da regra)", () => {
		const groups = [
			g("porto-1", "Porto", 8),
			g("porto-2", "Porto", 7),
			g("itau-1", "Itaú", 6),
		];
		const top = rankGroups(groups, input, 3);
		expect(top[0].group.id).toBe("porto-1");
		expect(top[0].score).toBeGreaterThanOrEqual(top[1].score);
	});

	it("FALLBACK: menos administradoras que N → completa com os melhores restantes (repete adm)", () => {
		const groups = [
			g("porto-1", "Porto", 8),
			g("porto-2", "Porto", 7),
			g("itau-1", "Itaú", 6),
		];
		const top = rankGroups(groups, input, 3);
		expect(top).toHaveLength(3); // não corta pra 2 só por causa da dedup
		expect(top.map((s) => s.group.id)).toEqual(["porto-1", "itau-1", "porto-2"]);
	});

	it("universo menor que N continua retornando todos (sem inventar)", () => {
		const groups = [g("porto-1", "Porto", 8), g("itau-1", "Itaú", 6)];
		expect(rankGroups(groups, input, 3)).toHaveLength(2);
	});

	it("uma só administradora com N ofertas → retorna N por score (degrada pro topo puro)", () => {
		const groups = [
			g("porto-1", "Porto", 8),
			g("porto-2", "Porto", 7),
			g("porto-3", "Porto", 6),
			g("porto-4", "Porto", 5),
		];
		const top = rankGroups(groups, input, 3);
		expect(top.map((s) => s.group.id)).toEqual(["porto-1", "porto-2", "porto-3"]);
	});
});
