import { describe, expect, it, vi } from "vitest";

// O módulo importa o banco; aqui só interessa a decisão de resposta.
vi.mock("@/db", () => ({ db: {} }));

describe("o CPF capturado no WhatsApp não responde com frase fixa", () => {
	it("CPF guardado: resposta NULA, o turno do agente segue (e pode fechar no mesmo turno)", async () => {
		const { respostaDoCaptureDeCpf } = await import("./identify-capture");
		expect(respostaDoCaptureDeCpf({ handled: true, outcome: "captured" })).toBeNull();
	});

	it("tentativa de CPF inválido mantém a resposta própria", async () => {
		const { respostaDoCaptureDeCpf, IDENTIFY_INVALID_CPF_REPLY } = await import(
			"./identify-capture"
		);
		expect(respostaDoCaptureDeCpf({ handled: true, outcome: "invalid" })).toBe(
			IDENTIFY_INVALID_CPF_REPLY,
		);
		expect(IDENTIFY_INVALID_CPF_REPLY).toMatch(/não confere/i);
	});

	it("texto que não é CPF segue pro modelo", async () => {
		const { respostaDoCaptureDeCpf } = await import("./identify-capture");
		expect(respostaDoCaptureDeCpf({ handled: false })).toBeNull();
	});
});
