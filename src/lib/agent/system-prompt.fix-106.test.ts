import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";

// ============================================================================
// FIX-106 — o prompt descreve o LOOP conversacional do simulador.
// Quando o usuário pergunta um mês-alvo ("e em 6 meses?"), o agente chama
// simulate_contemplation e NARRA os números; pode iterar. A WEB mantém a agulha
// (present_contemplation_dial).
// ============================================================================

describe("FIX-106 — prompt do simulador conversacional", () => {
	it("manda chamar simulate_contemplation no what-if de mês", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/simulate_contemplation/);
		// Acoplado a um gatilho de mês-alvo / loop.
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/m[êe]s-alvo|e em \d|loop|outro prazo/);
	});

	it("descreve os números a narrar (parcela após, lance, crédito líquido)", () => {
		const p = SPECIALIST_BASE_PROMPT.toLowerCase();
		expect(p).toMatch(/paymentaftercontemplation|parcela depois|parcela ap[óo]s/);
		expect(p).toMatch(/lance necess/);
		expect(p).toMatch(/cr[ée]dito l[íi]quido/);
	});

	it("mantém a agulha (present_contemplation_dial) na WEB e não a usa pra cada iteração de texto", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/present_contemplation_dial/);
		// Diferencia o caminho web (agulha) do caminho conversa (tool de cálculo).
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/agulha|web/);
	});

	it("ressalva de estimativa — não garante contemplação em mês específico", () => {
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/estimativa|n[ãa]o garant/);
	});
});
