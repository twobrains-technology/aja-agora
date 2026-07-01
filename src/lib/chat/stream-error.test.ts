// FIX-110 — onError uniforme em todo stream do chat.
// O helper garante que QUALQUER createUIMessageStream do route feche o turno com
// um error part tipado (mensagem real do Error, fallback estável caso contrário),
// em vez de depender do default da SDK por path.
import { describe, expect, it } from "vitest";
import { streamErrorMessage } from "./stream-error";

describe("FIX-110 — streamErrorMessage (onError uniforme)", () => {
	it("devolve a mensagem real de um Error", () => {
		expect(streamErrorMessage(new Error("boom da administradora"))).toBe("boom da administradora");
	});

	it("usa fallback estável pra não-Error (string, null, objeto)", () => {
		expect(streamErrorMessage("texto solto")).toBe("Erro interno no servidor");
		expect(streamErrorMessage(null)).toBe("Erro interno no servidor");
		expect(streamErrorMessage({ qualquer: "coisa" })).toBe("Erro interno no servidor");
	});

	it("Error sem message cai no fallback (nunca string vazia ao client)", () => {
		expect(streamErrorMessage(new Error(""))).toBe("Erro interno no servidor");
	});
});
