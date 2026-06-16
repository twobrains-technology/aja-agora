import { describe, expect, it } from "vitest";
import { computeConversaoDimension, computeFlags, scoreConversao } from "./scorer-internals";
import type { DeterministicSignals } from "./signals";

// Os helpers `average` e `pickPrimaryLead` são triviais (Math.avg / leads[0]) e
// não merecem teste próprio. O que importa testar:
// - `scoreConversao` traduz stage → score de forma estável (regra de negócio)
// - `computeFlags` aplica thresholds determinísticos junto com flags do juiz

const baseSignals = (overrides: Partial<DeterministicSignals> = {}): DeterministicSignals => ({
	replyRate: 0.8,
	qualifyCoverage: 0.5,
	qualifyMissing: [],
	numbersInTextFlagged: [],
	dropOffGate: null,
	conversionStage: "novo",
	hasLead: false,
	personaSegments: [],
	...overrides,
});

describe("scoreConversao — mapping stage → score", () => {
	it("novo = 0", () => {
		expect(scoreConversao("novo", false)).toBe(0);
	});

	it("engajado: hasLead muda nota (0.4 vs 0.6)", () => {
		expect(scoreConversao("engajado", false)).toBe(0.4);
		expect(scoreConversao("engajado", true)).toBe(0.6);
	});

	it("qualificado sem lead = 0.7 (qualificação parcial), com lead = 1.0", () => {
		expect(scoreConversao("qualificado", false)).toBe(0.7);
		expect(scoreConversao("qualificado", true)).toBe(1.0);
	});

	it("fechado_ganho = 1.0 e perdido = 0.1 (não é 0 — agente ainda tentou)", () => {
		expect(scoreConversao("fechado_ganho", true)).toBe(1.0);
		expect(scoreConversao("perdido", true)).toBe(0.1);
	});

	// FIX-43: split do fechamento (na_administradora → aguardando_pagamento →
	// fechado_ganho). São estágios pós-proposta, quase-fechados → score alto,
	// acima de proposta_enviada (0.95) e abaixo de fechado_ganho (1.0). Antes
	// caíam no fallback `return 0.0` (tratados como "novo") — bug silencioso.
	it("na_administradora e aguardando_pagamento pontuam alto (pós-proposta, quase-fechados)", () => {
		expect(scoreConversao("na_administradora", true)).toBeGreaterThan(0.95);
		expect(scoreConversao("na_administradora", true)).toBeLessThan(1.0);
		expect(scoreConversao("aguardando_pagamento", true)).toBeGreaterThan(0.95);
		expect(scoreConversao("aguardando_pagamento", true)).toBeLessThan(1.0);
		// monotônico: aguardando_pagamento mais perto do fechamento que na_administradora
		expect(scoreConversao("aguardando_pagamento", true)).toBeGreaterThan(
			scoreConversao("na_administradora", true),
		);
	});
});

describe("computeConversaoDimension — reasoning carrega contexto", () => {
	it("reasoning cita stage e hasLead pra debug", () => {
		const d = computeConversaoDimension(
			baseSignals({ conversionStage: "qualificado", hasLead: true }),
		);
		expect(d.reasoning).toContain("qualificado");
		expect(d.reasoning).toContain("sim");
	});
});

describe("computeFlags — threshold + judge OR", () => {
	const baseDims = {
		engajamento: { score: 0.8, reasoning: "x" },
		discovery: { score: 0.8, reasoning: "x" },
		continuidade: { score: 0.8, reasoning: "x" },
		naturalidade: { score: 0.8, reasoning: "x" },
		assertividade: { score: 0.8, reasoning: "x" },
		conversao: { score: 0.8, reasoning: "x" },
	};
	const noFlags = {
		hallucination: false,
		missedHandoff: false,
		incompleteDiscovery: false,
		lowEngagement: false,
	};
	const cleanSignals = baseSignals();

	it("threshold determinístico em scores baixos dispara mesmo sem juiz flaggar", () => {
		const dims = {
			...baseDims,
			engajamento: { score: 0.2, reasoning: "x" },
			discovery: { score: 0.3, reasoning: "x" },
		};
		const flags = computeFlags(noFlags, dims, cleanSignals);
		expect(flags.lowEngagement).toBe(true);
		expect(flags.incompleteDiscovery).toBe(true);
	});

	it("hallucination tem backstop em numbersInTextFlagged (juiz pode falhar mas cross-check pega)", () => {
		const flagged = baseSignals({
			numbersInTextFlagged: [{ messageId: "a1", number: "R$ 850", context: "..." }],
		});
		const flags = computeFlags(noFlags, baseDims, flagged);
		expect(flags.hallucination).toBe(true);
	});

	it("missedHandoff vem só do juiz (sem backstop determinístico)", () => {
		const flags = computeFlags({ ...noFlags, missedHandoff: true }, baseDims, cleanSignals);
		expect(flags.missedHandoff).toBe(true);

		const cleanFlags = computeFlags(noFlags, baseDims, cleanSignals);
		expect(cleanFlags.missedHandoff).toBe(false);
	});
});
