import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__setGenerateObjectDoClienteForTests,
	gerarFalaDoCliente,
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

	it("rejeita estado inválido do seam", async () => {
		__setGenerateObjectDoClienteForTests(fake({ texto: "x", estado: "talvez" }));
		await expect(
			gerarFalaDoCliente({ perfilId: "objecao", historico: [], turno: 2 }),
		).rejects.toThrow();
	});
});
