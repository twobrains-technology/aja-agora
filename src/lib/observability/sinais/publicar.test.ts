import { beforeEach, describe, expect, it, vi } from "vitest";

const { inserts, insertError } = vi.hoisted(() => ({
	inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	insertError: { atual: null as unknown },
}));

vi.mock("@/db", () => ({
	db: {
		insert: (table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				if (insertError.atual) throw insertError.atual;
				inserts.push({ table, values });
			},
		}),
	},
}));

import { usoDeIa } from "@/db/schema";
import { registrarUsoDeIa } from "./publicar";

describe("L25/P314 — o livro-caixa local cobre chamada de LLM fora do vendedor", () => {
	beforeEach(() => {
		inserts.length = 0;
		insertError.atual = null;
	});

	it("grava tokens e custo em `uso_de_ia` com a conversa", async () => {
		await registrarUsoDeIa({
			conversationId: "conv-1",
			modelo: "claude-haiku-4-5",
			tokensInput: 1_000_000,
			tokensOutput: 0,
		});

		expect(inserts).toHaveLength(1);
		expect(inserts[0].table).toBe(usoDeIa);
		expect(inserts[0].values).toMatchObject({
			conversationId: "conv-1",
			modelo: "claude-haiku-4-5",
			tokensInput: 1_000_000,
			tokensOutput: 0,
		});
		// 1,0 US$/milhão de entrada = 100 centavos de dólar.
		expect(inserts[0].values.custoUsdCents).toBe(100);
	});

	it("conversa ausente vira NULL — o insight de lead não tem conversa", async () => {
		await registrarUsoDeIa({ modelo: "claude-haiku-4-5", tokensInput: 10, tokensOutput: 5 });
		expect(inserts[0].values.conversationId).toBeNull();
	});

	// P314/L24 — a chamada AVULSA não pode ser descartada: ela entra no livro-caixa sem
	// conversa, e o custo da tela a soma numa linha própria.
	it("chamada sem conversa é gravada como avulsa, não descartada", async () => {
		await registrarUsoDeIa({
			modelo: "claude-haiku-4-5",
			tokensInput: 1_000_000,
			tokensOutput: 0,
		});
		expect(inserts).toHaveLength(1);
		expect(inserts[0].values.conversationId).toBeNull();
		expect(inserts[0].values.custoUsdCents).toBe(100);
	});

	// P217/P273 — o cache do prompt é a parcela que decide o custo real da IA, e ele
	// passou a ser gravado e cobrado (antes só existia no trace).
	it("grava o cache lido/escrito e cobra o cache no custo", async () => {
		await registrarUsoDeIa({
			modelo: "claude-haiku-4-5",
			tokensInput: 0,
			tokensOutput: 0,
			cacheRead: 1_000_000,
			cacheWrite: 200_000,
		});

		expect(inserts).toHaveLength(1);
		expect(inserts[0].values).toMatchObject({
			tokensCacheRead: 1_000_000,
			tokensCacheWrite: 200_000,
		});
		// Cache lido: 1M × US$ 0,10/M = 10 centavos; escrito: 200 mil × US$ 1,25/M = 25.
		expect(inserts[0].values.custoUsdCents).toBe(35);
	});

	it("cache não reportado fica NULL — não medido não é o mesmo que zero", async () => {
		await registrarUsoDeIa({ modelo: "claude-haiku-4-5", tokensInput: 10, tokensOutput: 5 });
		expect(inserts[0].values.tokensCacheRead).toBeNull();
		expect(inserts[0].values.tokensCacheWrite).toBeNull();
	});

	it("cache em modelo sem preço de cache: custo desconhecido, cache ainda registrado", async () => {
		await registrarUsoDeIa({
			modelo: "qwen3.6-flash",
			tokensInput: 10,
			tokensOutput: 5,
			cacheRead: 1_000,
		});

		expect(inserts[0].values.custoUsdCents).toBeNull();
		expect(inserts[0].values.tokensCacheRead).toBe(1_000);
	});

	it("modelo sem preço cadastrado NÃO vira zero: custo é `null`", async () => {
		await registrarUsoDeIa({
			modelo: "modelo-inexistente-xyz",
			tokensInput: 500,
			tokensOutput: 90,
		});
		expect(inserts).toHaveLength(1);
		expect(inserts[0].values.custoUsdCents).toBeNull();
	});

	it("chamada sem token nenhum não suja a tabela", async () => {
		await registrarUsoDeIa({ modelo: "claude-haiku-4-5", tokensInput: 0, tokensOutput: 0 });
		expect(inserts).toHaveLength(0);
	});

	it("falha de gravação não derruba quem chamou (livro-caixa é observabilidade)", async () => {
		insertError.atual = new Error("db fora do ar");
		const erro = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			registrarUsoDeIa({ modelo: "claude-haiku-4-5", tokensInput: 10, tokensOutput: 2 }),
		).resolves.toBeUndefined();

		expect(erro).toHaveBeenCalled();
		erro.mockRestore();
	});
});
