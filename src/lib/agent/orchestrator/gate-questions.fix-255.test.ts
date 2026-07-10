import { describe, expect, it } from "vitest";
import { gateQuestion } from "./gate-questions";

// FIX-255 (rodada 4, veredito Fable FINAL §N-D): a copy do gate "identify" na
// WEB dizia "Seu celular eu já pego aqui do WhatsApp" com o FORM de celular
// na tela (gatePartData "identity" pede CPF E celular — prefilledPhone:null).
// A frase só é verdadeira no canal WhatsApp (celular = waId, já conhecido).
// Achado em 3 de 3 runs do veredito.
describe("FIX-255 — gateQuestion('identify') é ciente do canal", () => {
	it("canal 'web' — NÃO menciona WhatsApp, pede CPF e celular", () => {
		const q = gateQuestion("identify", "auto", undefined, "web");
		expect(q?.toLowerCase()).not.toContain("whatsapp");
		expect(q?.toLowerCase()).toContain("cpf");
		expect(q?.toLowerCase()).toContain("celular");
	});

	it("canal 'whatsapp' explícito — mantém a copy original (celular já é o waId)", () => {
		const q = gateQuestion("identify", "auto", undefined, "whatsapp");
		expect(q).toBe("Me manda seu CPF, só os números. Seu celular eu já pego aqui do WhatsApp.");
	});

	it("sem canal (default) — mantém o comportamento pré-FIX-255 (whatsapp) — compat com os chamadores existentes", () => {
		const q = gateQuestion("identify", "auto");
		expect(q).toBe("Me manda seu CPF, só os números. Seu celular eu já pego aqui do WhatsApp.");
	});
});
