import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

// Camada 1 (estrutural) — jornada do .docx (2026-05-29, corrigida 2026-06-05).
// O doc manda educar sobre lance embutido e perguntar se quer considerá-lo
// nas simulações ANTES de buscar — pra QUALQUER resposta do gate lance.
// FIX-4 (teste manual Kairo 2026-06-05): a versão anterior só educava quem
// respondeu "yes" — mas o PRÓPRIO texto do docx diz que o lance embutido
// "ajuda quem não possui todo o valor do lance hoje", ou seja, exatamente
// quem respondeu "Não"/"Talvez". No docx a educação é sub-bullet PARALELO ao
// "Se sim" (não aninhado nele). A exclusão fazia o ramo educativo "sumir"
// pra metade dos usuários — percebido como intermitência.
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

	it("hasLance='no' => TAMBÉM passa pelo gate lance-embutido (FIX-4: docx educa todo mundo)", () => {
		const meta = baseMeta();
		meta.qualifyAnswers!.hasLance = "no";
		expect(nextGate(meta, { hasContactName: true })).toBe("lance-embutido");
	});

	it("hasLance='maybe' => TAMBÉM passa pelo gate lance-embutido (FIX-4)", () => {
		const meta = baseMeta();
		meta.qualifyAnswers!.hasLance = "maybe";
		expect(nextGate(meta, { hasContactName: true })).toBe("lance-embutido");
	});

	it("hasLance='no' com lanceEmbutido decidido => segue pra search (sem loop)", () => {
		const meta = baseMeta();
		meta.qualifyAnswers!.hasLance = "no";
		meta.qualifyAnswers!.lanceEmbutido = true;
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
	});

	it("hasLance='no' NÃO passa pelo lance-value (valor do lance é só pra quem tem reserva)", () => {
		const meta = baseMeta();
		meta.qualifyAnswers!.hasLance = "no";
		meta.qualifyAnswers!.lanceValue = undefined;
		expect(nextGate(meta, { hasContactName: true })).toBe("lance-embutido");
	});
});
