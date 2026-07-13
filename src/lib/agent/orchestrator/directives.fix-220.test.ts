import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildSearchSummaryDirective } from "./directives";

// ============================================================================
// FIX-220 — Ata 2026-07-04 (item 4.1, P1): "Na 1ª lista, mostrar basicamente
// todos os grupos com mesmo peso — sem 'preferencial', porque ainda não há
// dado de lance pra recomendar nada."
// ----------------------------------------------------------------------------
// A diretiva do reveal instruía highlightBestIndex=0 "pra DESTACAR a
// recomendada" — a 1ª lista (sem dado de lance) não pode afirmar preferência.
// A inseparabilidade recommendation_card ↔ comparison_table (FIX-78) continua
// valendo — só a FRAMING de "destaque" que sai.
// ============================================================================

const META: ConversationMetadata = {
	currentCategory: "auto",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
};

describe("FIX-220 — 1ª lista de reveal é neutra (sem preferencial)", () => {
	const reveal = buildSearchSummaryDirective({ category: "auto", meta: META });

	it("NÃO instrui a LLM a setar highlightBestIndex pra destacar a recomendada", () => {
		expect(reveal).not.toMatch(/highlightBestIndex\s*=\s*0/);
		expect(reveal.toLowerCase()).not.toMatch(/highlightbestindex[\s\S]{0,40}destac/);
	});

	it("deixa explícito que a 1ª lista é neutra — mesmo peso, sem dado de lance ainda", () => {
		expect(reveal.toLowerCase()).toMatch(/mesmo peso|sem destacar nenhuma|neutr/);
	});

	it("a inseparabilidade recommendation_card ↔ comparison_table (FIX-78) segue intacta", () => {
		expect(reveal).toMatch(/INSEPAR[ÁA]VE/i);
		expect(reveal).toMatch(/FIX-78/);
	});
});
