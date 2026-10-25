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

describe("telefone e número comprido não são CPF", () => {
	it("CPF com DV válido é capturado, com ou sem pontuação", async () => {
		const { decidirCpfDoTexto } = await import("./identify-capture");
		expect(decidirCpfDoTexto("meu cpf é 529.982.247-25", { pedidoDeCpf: false })).toEqual({
			outcome: "captured",
			cpf: "52998224725",
		});
		expect(decidirCpfDoTexto("52998224725", { pedidoDeCpf: false })).toEqual({
			outcome: "captured",
			cpf: "52998224725",
		});
	});

	it("celular ditado NÃO vira CPF nem identidade persistida", async () => {
		const { decidirCpfDoTexto } = await import("./identify-capture");
		expect(decidirCpfDoTexto("meu celular é 11 98765-4321", { pedidoDeCpf: false }).outcome).toBe(
			"none",
		);
		// 11900000083 passa no dígito verificador por coincidência: mesmo assim é
		// CELULAR (DDD válido + 9), e identidade não se grava com telefone.
		expect(decidirCpfDoTexto("11900000083", { pedidoDeCpf: false }).outcome).toBe("none");
	});

	it("número comprido fora de um pedido de CPF segue pro modelo", async () => {
		const { decidirCpfDoTexto } = await import("./identify-capture");
		expect(decidirCpfDoTexto("meu número é 5511987654321", { pedidoDeCpf: false }).outcome).toBe(
			"none",
		);
		expect(decidirCpfDoTexto("quero um carro de 80 mil", { pedidoDeCpf: false }).outcome).toBe(
			"none",
		);
	});

	it("só quando o CPF acabou de ser pedido o número errado vira 'CPF não confere'", async () => {
		const { decidirCpfDoTexto } = await import("./identify-capture");
		expect(decidirCpfDoTexto("11987654321", { pedidoDeCpf: true }).outcome).toBe("invalid");
		expect(decidirCpfDoTexto("111.444.777-36", { pedidoDeCpf: true }).outcome).toBe("invalid");
	});

	it("o pedido de CPF é a ÚLTIMA fala do agente, sem turno do cliente no meio", async () => {
		const { pedidoDeCpfNoUltimoBalao } = await import("./identify-capture");
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "me manda seu CPF?" })).toBe(
			true,
		);
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "qual valor você quer?" })).toBe(
			false,
		);
		// A última fala foi do cliente: o número que ele manda agora não responde a
		// pedido nenhum.
		expect(pedidoDeCpfNoUltimoBalao({ role: "user", content: "meu cpf é 52998224725" })).toBe(
			false,
		);
		expect(pedidoDeCpfNoUltimoBalao(null)).toBe(false);
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
