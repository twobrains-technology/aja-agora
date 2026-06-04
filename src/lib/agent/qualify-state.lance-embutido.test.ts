import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

// Camada 1 (estrutural) — jornada do .docx (2026-05-29).
// Quando o usuário diz que TEM reserva pra dar lance ("sim"), o doc manda
// educar sobre lance embutido e perguntar se quer considerá-lo nas simulações
// ANTES de buscar. Logo o funil precisa inserir o gate `lance-embutido` entre
// o gate `lance` e o `search` — só pra quem respondeu "yes".
function baseMeta(): ConversationMetadata {
	return {
		currentCategory: "imovel",
		experiencePrev: "returning",
		qualifyConsented: true,
		// lanceValue respondido (gate lance-value, docx — suite própria em
		// qualify-state.lance-value.test.ts); este arquivo testa SÓ o lance embutido.
		qualifyAnswers: {
			creditMax: 400_000,
			monthlyBudget: 3_000,
			prazoMeses: 0,
			lanceValue: 120_000,
		},
		// D1 (gate identify): identidade já coletada — este arquivo testa SÓ o
		// sub-fluxo de lance embutido; o gate identify tem suite própria
		// (qualify-state.identify-gate.test.ts).
		identityCollected: true,
	};
}

describe("nextGate — sub-fluxo de lance embutido", () => {
	it("hasLance='yes' e lanceEmbutido indefinido => gate lance-embutido (não pula pra search)", () => {
		const meta = baseMeta();
		meta.qualifyAnswers!.hasLance = "yes";
		expect(nextGate(meta, { hasContactName: true })).toBe("lance-embutido");
	});

	it("hasLance='yes' com lanceEmbutido já decidido (true) => search", () => {
		const meta = baseMeta();
		meta.qualifyAnswers!.hasLance = "yes";
		meta.qualifyAnswers!.lanceEmbutido = true;
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});

	it("hasLance='yes' com lanceEmbutido decidido (false) => search", () => {
		const meta = baseMeta();
		meta.qualifyAnswers!.hasLance = "yes";
		meta.qualifyAnswers!.lanceEmbutido = false;
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});

	it("hasLance='no' => search direto, sem gate de lance embutido", () => {
		const meta = baseMeta();
		meta.qualifyAnswers!.hasLance = "no";
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});

	it("hasLance='maybe' => search direto (lance embutido só pra quem tem reserva)", () => {
		const meta = baseMeta();
		meta.qualifyAnswers!.hasLance = "maybe";
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});
});
