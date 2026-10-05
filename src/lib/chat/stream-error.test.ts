// FIX-110 + B5 — onError uniforme em todo stream do chat.
//
// O helper garante que QUALQUER createUIMessageStream do route feche o turno com
// um error part tipado. A partir do B5 ele devolve um CÓDIGO de um conjunto
// fechado — a mensagem crua do servidor (em inglês, vinda do gateway) não vai
// mais ao navegador. A UI traduz o código (`textoDoErroDoChat`).
import { describe, expect, it } from "vitest";
import { streamErrorMessage, TEXTO_ERRO_DO_CHAT, textoDoErroDoChat } from "./stream-error";

describe("B5 — streamErrorMessage devolve código, nunca a mensagem do servidor", () => {
	it("crédito do gateway vira llm_billing", () => {
		const err = new Error("Your credit balance is too low to access the Anthropic API");
		expect(streamErrorMessage(err)).toBe("llm_billing");
	});

	it("limite de uso vira llm_rate_limit", () => {
		expect(streamErrorMessage(new Error("429 Too Many Requests"))).toBe("llm_rate_limit");
		expect(streamErrorMessage(new Error("rate limit exceeded"))).toBe("llm_rate_limit");
	});

	it("gateway fora/instável vira llm_indisponivel", () => {
		expect(streamErrorMessage(new Error("503 Service Unavailable"))).toBe("llm_indisponivel");
		expect(streamErrorMessage(new Error("fetch failed"))).toBe("llm_indisponivel");
	});

	it("não-Error e erro sem tipo conhecido caem em erro_interno", () => {
		expect(streamErrorMessage("texto solto")).toBe("erro_interno");
		expect(streamErrorMessage(null)).toBe("erro_interno");
		expect(streamErrorMessage({ qualquer: "coisa" })).toBe("erro_interno");
	});

	it("NUNCA devolve a mensagem crua em inglês", () => {
		const err = new Error("credit balance is too low");
		expect(streamErrorMessage(err)).not.toContain("credit");
	});
});

describe("B5 — textoDoErroDoChat traduz para português", () => {
	it("cada código tem texto em português com acentuação", () => {
		for (const texto of Object.values(TEXTO_ERRO_DO_CHAT)) {
			expect(texto.length).toBeGreaterThan(0);
		}
		expect(textoDoErroDoChat("llm_billing")).toMatch(/instabilidade/i);
	});

	it("código desconhecido cai no genérico — a tela nunca mostra o código cru", () => {
		expect(textoDoErroDoChat("codigo_que_nao_existe")).toBe(TEXTO_ERRO_DO_CHAT.erro_interno);
		expect(textoDoErroDoChat(null)).toBe(TEXTO_ERRO_DO_CHAT.erro_interno);
	});
});