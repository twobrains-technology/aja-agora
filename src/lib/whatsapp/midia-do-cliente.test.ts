import { describe, expect, it, vi } from "vitest";

// O módulo importa o banco; aqui só interessa o texto que entra no histórico.
vi.mock("@/db", () => ({ db: {} }));

describe("a transcrição do áudio entra no histórico mascarada", () => {
	it("CPF falado vira marcador, igual à fala digitada", async () => {
		const { falaDoClienteMascarada } = await import("./midia-do-cliente");
		const texto = falaDoClienteMascarada("oi, meu cpf é 529.982.247-25, pode buscar");
		expect(texto).not.toContain("529.982.247-25");
		expect(texto).toContain("[CPF recebido e guardado]");
		expect(texto).toContain("pode buscar");
	});

	it("celular falado vira marcador", async () => {
		const { falaDoClienteMascarada } = await import("./midia-do-cliente");
		const texto = falaDoClienteMascarada("meu número é (11) 98765-4321");
		expect(texto).not.toContain("98765");
		expect(texto).toContain("[telefone recebido e guardado]");
	});

	it("é o MESMO mascarador do turno — o que casa com a linha gravada", async () => {
		const { falaDoClienteMascarada } = await import("./midia-do-cliente");
		const { capturarIdentidadeDoTexto } = await import("@/lib/agent/pi/turno-livre");
		const fala = "cpf 529.982.247-25 e celular (11) 98765-4321";
		// Se divergissem, o áudio do cliente com CPF nunca casaria com a fala que o
		// turno gravou e o texto bruto voltaria para o histórico pelo fallback.
		expect(falaDoClienteMascarada(fala)).toBe(capturarIdentidadeDoTexto(fala, null).textoLimpo);
	});

	it("fala sem dado sensível passa intacta", async () => {
		const { falaDoClienteMascarada } = await import("./midia-do-cliente");
		expect(falaDoClienteMascarada("quero simular um carro de 80 mil")).toBe(
			"quero simular um carro de 80 mil",
		);
	});
});
