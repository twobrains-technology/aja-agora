/**
 * Camada 1 — FIX-18: o reveal confronta honestamente quando o orçamento mensal
 * declarado não fecha com a oferta real. Jornada real do Kairo (2026-06-11):
 * carro 250k · R$ 1.000/mês; a melhor oferta tinha parcela de R$ 9.828,92 (9,8×)
 * e o agente celebrou ("bem próximo do seu objetivo") em vez de confrontar. A
 * diretiva do reveal e o system-prompt agora instruem o confronto ANTES de
 * celebrar. Tom guia-não-empurra (jornada: "Seu objetivo primeiro").
 */

import { describe, expect, it } from "vitest";
import { buildSearchSummaryDirective } from "@/lib/agent/orchestrator/directives";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

const metaComOrcamento = {
	currentCategory: "auto",
	experiencePrev: "first",
	qualifyAnswers: {
		creditMin: 200_000,
		creditMax: 250_000,
		monthlyBudget: 1_000,
		prazoMeses: 27,
		hasLance: "no",
	},
} as unknown as ConversationMetadata;

describe("FIX-18 — confronto de viabilidade no reveal (diretiva)", () => {
	it("a diretiva carrega o orçamento declarado e instrui confronto honesto antes de celebrar", () => {
		const d = buildSearchSummaryDirective({ category: "auto", meta: metaComOrcamento });
		// referência do confronto = o orçamento declarado (R$ 1.000)
		expect(d).toMatch(/1000/);
		// instrui confronto quando a parcela real estoura o orçamento
		expect(d).toMatch(/confront|acima do.*or[çc]amento|estoura/i);
		// tom guia: oferece ajustar o valor do bem (não empurra a venda)
		expect(d).toMatch(/ajustar o valor do bem|ajustar o bem/i);
	});

	it("sem orçamento declarado, a diretiva não quebra (sem bloco de confronto forçado)", () => {
		const semBudget = {
			...metaComOrcamento,
			qualifyAnswers: { creditMax: 250_000, prazoMeses: 27, hasLance: "no" },
		} as unknown as ConversationMetadata;
		const d = buildSearchSummaryDirective({ category: "auto", meta: semBudget });
		expect(typeof d).toBe("string");
		expect(d.length).toBeGreaterThan(0);
	});
});

describe("FIX-18 — regra dura de confronto honesto no system-prompt", () => {
	it("o prompt instrui não celebrar/rotular como compatível quando a parcela estoura o orçamento", () => {
		const prompt = `${SPECIALIST_BASE_PROMPT}\n${SYSTEM_PROMPT}`;
		expect(prompt).toMatch(/or[çc]amento/i);
		expect(prompt).toMatch(/confront|n[ãa]o celebr|acima do.*or[çc]amento|honest/i);
	});
});
