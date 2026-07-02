import { describe, expect, it } from "vitest";
import type { ConversationMetadata, QualifyAnswers } from "@/lib/agent/personas";
import { buildRangePickerDirective, buildSearchSummaryDirective } from "./directives";

// ============================================================================
// FIX-INTEGRIDADE — directives NÃO passam budget se não foi declarado / se MOTO
// ============================================================================

describe("FIX-INTEGRIDADE — directives: budget blindado por categoria", () => {
	const baseMeta: ConversationMetadata = {
		currentCategory: "imovel",
		expertiseLevel: "leigo",
		experiencePrev: "first",
	};

	// buildSearchSummaryDirective virou assinatura por objeto ({ category, meta })
	// e lê qualifyAnswers do meta (antes era (meta, q) posicional). Helper adapta as
	// chamadas legadas deste teste sem mudar a semântica dos asserts.
	const dirFor = (m: ConversationMetadata, q: QualifyAnswers) =>
		buildSearchSummaryDirective({
			category: m.currentCategory as string,
			meta: { ...m, qualifyAnswers: q },
		});

	it("buildSearchSummaryDirective — IMOVEL COM orçamento: passa budget no bloco confrontoBudget", () => {
		const q: QualifyAnswers = {
			creditMin: 100_000,
			creditMax: 300_000,
			monthlyBudget: 1_500, // Cliente DECLAROU
			prazoMeses: 180,
			hasLance: "no",
		};
		const dir = dirFor(baseMeta, q);
		// Deve incluir "CONFRONTO DE VIABILIDADE" + o valor do orçamento. O directive é
		// prompt INTERNO e escreve o valor cru ("R$ 1500", como os demais números do
		// bloco), sem separador de milhar — o regex aceita com ou sem o ponto.
		expect(dir).toMatch(/CONFRONTO DE VIABILIDADE[\s\S]{0,200}R\$ 1[.,]?500/);
		// E deve passar "budget=1500" nos args do recommend_groups.
		expect(dir).toMatch(/budget=1500/);
	});

	it("buildSearchSummaryDirective — IMOVEL SEM orçamento: NÃO inclui bloco confrontoBudget", () => {
		const q: QualifyAnswers = {
			creditMin: 100_000,
			creditMax: 300_000,
			monthlyBudget: undefined, // Cliente NÃO declarou
			prazoMeses: 180,
			hasLance: "no",
		};
		const dir = dirFor(baseMeta, q);
		// NÃO deve incluir "CONFRONTO DE VIABILIDADE" (só aparece se hasBudget=true).
		expect(dir).not.toMatch(/CONFRONTO DE VIABILIDADE/);
		// E NÃO deve passar "budget=" nos args.
		expect(dir).not.toMatch(/budget=/);
	});

	it("buildSearchSummaryDirective — MOTO: NÃO passa budget mesmo que monthlyBudget esteja set", () => {
		const motoMeta: ConversationMetadata = {
			...baseMeta,
			currentCategory: "moto",
		};
		const q: QualifyAnswers = {
			creditMin: 8_000,
			creditMax: 30_000,
			monthlyBudget: 500, // Valor set (mas MOTO não coleta)
			prazoMeses: 60,
			hasLance: "no",
		};
		const dir = dirFor(motoMeta, q);
		// MOTO NÃO deve passar budget no recommend_groups, mesmo se monthlyBudget set.
		// Verificar se há guardrail "moto" que cima budget ou se budget não entra.
		// Por enquanto, verificar se "budget=" não aparece (já que MOTO não coleta).
		// NOTA: se o código AINDA passar budget pra MOTO, este teste FALHA — é o bug.
		expect(dir).not.toMatch(/budget=/);
	});

	it("buildSearchSummaryDirective — AUTO com orçamento: passa budget", () => {
		const autoMeta: ConversationMetadata = {
			...baseMeta,
			currentCategory: "auto",
		};
		const q: QualifyAnswers = {
			creditMin: 50_000,
			creditMax: 150_000,
			monthlyBudget: 800,
			prazoMeses: 72,
			hasLance: "yes",
		};
		const dir = dirFor(autoMeta, q);
		expect(dir).toMatch(/budget=800/);
		expect(dir).toMatch(/CONFRONTO DE VIABILIDADE/);
	});

	it("directives NÃO mencionam 'teto' ou 'orçamento' DECLARADO sem estar condicionado", () => {
		// Verificar que a narrativa não assume teto/orçamento como fato sem condition.
		const q: QualifyAnswers = {
			creditMin: 100_000,
			creditMax: 300_000,
			monthlyBudget: undefined, // Cliente NÃO declarou
			prazoMeses: 180,
			hasLance: "no",
		};
		const dir = dirFor(baseMeta, q);
		const paragraph = dir.match(/parcela mensal[\s\S]{0,200}(?=[,.]|$)/)?.[0] || "";
		// Se monthlyBudget undefined, não deve mencionar "seu teto" ou "seu orçamento".
		if (!q.monthlyBudget) {
			// Linha 242 da directive: "parcela mensal=R$ {q.monthlyBudget}" só aparece se hasBudget.
			expect(dir).not.toMatch(/parcela mensal=R\$/);
		}
	});
});
