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
	propostas: 0,
	contratoFechado: false,
	alertas: [],
	repeticoesDoAgente: 0,
	...overrides,
});

// A RÉGUA MUDOU EM 19/08/2026 (PRD §5.1): conversão passou a medir DESFECHO
// (proposta gerada / contrato fechado), e o estágio do lead só refina dentro da
// faixa. O mapa fixo antigo dava 0,85 a uma conversa com zero propostas — e
// 1,0 a quem morreu `qualificado`, acima de quem mandou proposta. Os casos
// abaixo foram reescritos contra a régua nova; a cobertura fina do teto e da
// monotonicidade vive em `conversao-mede-desfecho.test.ts`.
const SEM_PROPOSTA = { propostas: 0, contratoFechado: false };
const COM_PROPOSTA = { propostas: 1, contratoFechado: false };

describe("scoreConversao — o desfecho manda, o estágio refina", () => {
	it("novo = 0", () => {
		expect(scoreConversao("novo", false, SEM_PROPOSTA)).toBe(0);
	});

	it("engajado sem proposta: hasLead ainda diferencia, mas em patamar baixo", () => {
		expect(scoreConversao("engajado", false, SEM_PROPOSTA)).toBeLessThan(
			scoreConversao("engajado", true, SEM_PROPOSTA),
		);
		expect(scoreConversao("engajado", true, SEM_PROPOSTA)).toBeLessThan(0.4);
	});

	it("qualificado com lead e sem proposta bate no teto — não passa dele", () => {
		expect(scoreConversao("qualificado", false, SEM_PROPOSTA)).toBeLessThan(
			scoreConversao("qualificado", true, SEM_PROPOSTA),
		);
		expect(scoreConversao("qualificado", true, SEM_PROPOSTA)).toBe(0.4);
	});

	it("fechado_ganho = 1.0; perdido sem proposta fica no chão", () => {
		expect(scoreConversao("fechado_ganho", true, COM_PROPOSTA)).toBe(1.0);
		expect(scoreConversao("perdido", true, SEM_PROPOSTA)).toBeLessThan(0.1);
	});

	// FIX-43 continua valendo DENTRO da faixa pós-proposta: os estágios
	// quase-fechados pontuam acima de `proposta_enviada` e abaixo do fechamento.
	it("na_administradora e aguardando_pagamento seguem monotônicos, com proposta real", () => {
		expect(scoreConversao("na_administradora", true, COM_PROPOSTA)).toBeGreaterThan(
			scoreConversao("proposta_enviada", true, COM_PROPOSTA),
		);
		expect(scoreConversao("aguardando_pagamento", true, COM_PROPOSTA)).toBeGreaterThan(
			scoreConversao("na_administradora", true, COM_PROPOSTA),
		);
		expect(scoreConversao("aguardando_pagamento", true, COM_PROPOSTA)).toBeLessThan(1.0);
	});
});

describe("computeConversaoDimension — reasoning carrega contexto", () => {
	it("reasoning cita stage e hasLead pra debug", () => {
		const d = computeConversaoDimension(
			baseSignals({ conversionStage: "qualificado", hasLead: true }),
		);
		expect(d.reasoning).toContain("qualificado");
		expect(d.reasoning).toContain("sim");
		// O desfecho é a primeira coisa que o reasoning informa (PRD §5.1).
		expect(d.reasoning).toMatch(/Propostas geradas: \d+/);
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
