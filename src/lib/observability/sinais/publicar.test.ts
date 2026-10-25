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
