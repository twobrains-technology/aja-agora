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

	it("tolera estado fora do enum: vira 'continua' com a fala preservada", async () => {
		// Modelo local pode devolver estado fora do enum; se o texto existe, é fala válida.
		__setGenerateObjectDoClienteForTests(
			fake({ texto: "mas e a contemplação?", estado: "quero penso" }),
		);
		const r = await gerarFalaDoCliente({ perfilId: "objecao", historico: [], turno: 2 });
		expect(r).toEqual({ texto: "mas e a contemplação?", estado: "continua", origem: "ia" });
	});

	it("repete com o erro no prompt quando a primeira tentativa falha", async () => {
		let chamadas = 0;
		let promptDaSegunda = "";
		const impl = (async (opts: { prompt: string }) => {
			chamadas++;
			if (chamadas === 1) throw new Error("502 Bad Gateway");
			promptDaSegunda = opts.prompt;
			return { object: { texto: "oi de novo", estado: "continua" } };
		}) as unknown as Parameters<typeof __setGenerateObjectDoClienteForTests>[0];
		__setGenerateObjectDoClienteForTests(impl);
		const r = await gerarFalaDoCliente({ perfilId: "objecao", historico: [], turno: 2 });
		expect(chamadas).toBe(2);
		expect(r).toEqual({ texto: "oi de novo", estado: "continua", origem: "ia" });
		expect(promptDaSegunda).toContain("502 Bad Gateway");
	});

	it("falha depois de esgotar as duas tentativas", async () => {
		let chamadas = 0;
		const impl = (async () => {
			chamadas++;
			throw new Error("502 Bad Gateway");
		}) as unknown as Parameters<typeof __setGenerateObjectDoClienteForTests>[0];
		__setGenerateObjectDoClienteForTests(impl);
		await expect(
			gerarFalaDoCliente({ perfilId: "objecao", historico: [], turno: 2 }),
		).rejects.toThrow("502 Bad Gateway");
		expect(chamadas).toBe(2);
	});
});
