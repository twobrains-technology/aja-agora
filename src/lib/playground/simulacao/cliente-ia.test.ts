import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__setGenerateObjectDoClienteForTests,
	gerarFalaDoCliente,
	MODELO_DA_IA_CLIENTE,
	modeloDaIaCliente,
	montarPromptDoCliente,
	montarSystemDoCliente,
} from "./cliente-ia";
import { perfilPorId } from "./perfis-de-cliente";

afterEach(() => __setGenerateObjectDoClienteForTests(null));

const fake = (object: unknown) =>
	vi.fn(async () => ({ object })) as unknown as Parameters<
		typeof __setGenerateObjectDoClienteForTests
	>[0];

describe("cliente-ia", () => {
	it("system contém a persona e a hora fixa", () => {
		const p = perfilPorId("madrugada-sem-atendente");
		const s = montarSystemDoCliente(p, "03:00");
		expect(s).toContain(p.persona);
		expect(s).toContain("03:00");
		expect(montarSystemDoCliente(p)).not.toContain("03:00");
	});

	it("prompt traz o histórico e os cards", () => {
		const p = perfilPorId("caminho-feliz");
		const t = montarPromptDoCliente(
			p,
			[
				{ autor: "cliente", texto: "oi", cards: [] },
				{ autor: "vendedor", texto: "olha essa", cards: ["c1"] },
			],
			2,
		);
		expect(t).toContain("Cliente: oi");
		expect(t).toContain("Vendedor: olha essa [cards: c1]");
	});

	it("devolve o objeto do seam com origem ia", async () => {
		__setGenerateObjectDoClienteForTests(fake({ texto: "quanto fica?", estado: "continua" }));
		const r = await gerarFalaDoCliente({ perfilId: "objecao", historico: [], turno: 2 });
		expect(r).toEqual({ texto: "quanto fica?", estado: "continua", origem: "ia" });
	});

	it("respeita o override por env AI_CLIENT_MODEL", () => {
		const antes = process.env.AI_CLIENT_MODEL;
		process.env.AI_CLIENT_MODEL = "  ";
		expect(modeloDaIaCliente()).toBe(MODELO_DA_IA_CLIENTE); // var vazia cai no padrão
		process.env.AI_CLIENT_MODEL = "claude-opus-4-6";
		expect(modeloDaIaCliente()).toBe("claude-opus-4-6");
		if (antes === undefined) delete process.env.AI_CLIENT_MODEL;
		else process.env.AI_CLIENT_MODEL = antes;
	});

	it("rejeita estado inválido do seam", async () => {
		__setGenerateObjectDoClienteForTests(fake({ texto: "x", estado: "talvez" }));
		await expect(
			gerarFalaDoCliente({ perfilId: "objecao", historico: [], turno: 2 }),
		).rejects.toThrow();
	});
});
