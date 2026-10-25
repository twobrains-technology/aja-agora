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

describe("o celular do fechamento nunca é um número inventado", () => {
	it("conversa real: o celular é o número da conversa", async () => {
		const { celularDeFechamento } = await import("./identify-capture");
		const r = celularDeFechamento({
			waId: "5511987654321",
			cpf: "11144477735",
			celular: "11987654321",
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.origem).toBe("conversa");
	});

	it("simulador sem par de teste no ambiente: RECUSA, não manda hash pra Bevi", async () => {
		const { celularDeFechamento } = await import("./identify-capture");
		const r = celularDeFechamento({
			waId: "SIM-be27b2e8-3b1d-4702-92c1-87832589bfa9",
			cpf: "11144477735",
			celular: "62908872753",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.motivo).toBe("falta-o-par-de-teste");
	});

	it("simulador com o par da casa: usa o PAR, não o hash", async () => {
		const { celularDeFechamento } = await import("./identify-capture");
		const vitrine = await import("@/lib/bevi/identidade-vitrine");
		const par = vitrine.identidadeDeVitrine();
		if (!par) {
			// Sem PII no ambiente de teste, a recusa é o comportamento esperado.
			const r = celularDeFechamento({
				waId: "SIM-abc",
				cpf: "11144477735",
				celular: "62908872753",
			});
			expect(r.ok).toBe(false);
			return;
		}
		const r = celularDeFechamento({ waId: "SIM-abc", cpf: par.cpf, celular: "62908872753" });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.origem).toBe("par-de-teste");
			expect(r.celular).toBe(par.celular);
			expect(r.celular).not.toBe("62908872753");
		}
	});
});
