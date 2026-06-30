import { describe, expect, it } from "vitest";
import { QUALIFY_GATE_INPUT_KIND } from "./qualify-config";

// ============================================================================
// FIX-105 — qualificação híbrida (binárias = botão, valor = conversa).
// Decisão Kairo 2026-06-28: perguntas BINÁRIAS (experiência prévia, tem reserva
// pra lance) mantêm o botão (resposta clara e rápida); a pergunta ABERTA (valor
// do bem) vira conversa. Contrato consumido pelos blocos de canal (web/whatsapp)
// pra decidir o tipo de input de cada gate.
// ============================================================================

describe("QUALIFY_GATE_INPUT_KIND — classificação híbrida dos gates (FIX-105)", () => {
	it("perguntas binárias são BOTÃO: experience e lance", () => {
		expect(QUALIFY_GATE_INPUT_KIND.experience).toBe("button");
		expect(QUALIFY_GATE_INPUT_KIND.lance).toBe("button");
	});

	it("o valor do bem (credit) é CONVERSA (FIX-104)", () => {
		expect(QUALIFY_GATE_INPUT_KIND.credit).toBe("conversation");
	});

	it("o valor do lance (lance-value), quando há lance, é CONVERSA (pergunta aberta)", () => {
		expect(QUALIFY_GATE_INPUT_KIND["lance-value"]).toBe("conversation");
	});

	it("consent e lance-embutido (binárias de opt-in) são BOTÃO", () => {
		expect(QUALIFY_GATE_INPUT_KIND.consent).toBe("button");
		expect(QUALIFY_GATE_INPUT_KIND["lance-embutido"]).toBe("button");
	});

	it("NÃO classifica o gate de prazo (timeframe saiu da qualificação — FIX-103)", () => {
		expect(QUALIFY_GATE_INPUT_KIND).not.toHaveProperty("timeframe");
	});
});
