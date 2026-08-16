// A Lei 5 (observabilidade de tool I/O), com um chamador de verdade.
//
// `tool-io-log.ts` foi escrito para o runtime do AI SDK e, depois da migração
// para LangGraph, ficou com ZERO chamadores: em três dias de produção não houve
// uma única linha `[tool-io]`. Módulo de observabilidade sem chamador é pior que
// não ter nenhum, porque parece que existe cobertura.
//
// Este teste existe para que isso não se repita em silêncio: se alguém remover a
// chamada do adapter, ele fica vermelho.

import type { Tool as AiSdkTool } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { toLangChainTool } from "./tool-adapter";

const CONV = "conv-tool-io";

function toolFake(execute: (input: unknown) => Promise<unknown>): AiSdkTool {
	return {
		description: "tool de teste",
		inputSchema: z.object({ valor: z.number() }),
		execute,
	} as unknown as AiSdkTool;
}

let logs: string[] = [];
let erros: string[] = [];

beforeEach(() => {
	logs = [];
	erros = [];
	vi.spyOn(console, "log").mockImplementation((line: unknown) => {
		logs.push(String(line));
	});
	vi.spyOn(console, "error").mockImplementation((line: unknown) => {
		erros.push(String(line));
	});
});

afterEach(() => vi.restoreAllMocks());

const linhaDeToolIo = (fonte: string[]) =>
	fonte
		.map((l) => {
			try {
				return JSON.parse(l);
			} catch {
				return null;
			}
		})
		.find((o) => o?.source === "tool-io");

describe("tool-adapter — toda tool que roda deixa rastro grepável", () => {
	it("tool bem-sucedida emite uma linha tool-io com nome, input e output", async () => {
		const tool = toLangChainTool(
			"simulate_quota",
			toolFake(async () => ({ parcela: 1234 })),
			CONV,
		);

		await tool.invoke({ valor: 90000 });

		const linha = linhaDeToolIo(logs);
		expect(linha).toBeTruthy();
		expect(linha.tool).toBe("simulate_quota");
		expect(linha.conversation_id).toBe(CONV);
		expect(linha.input).toEqual({ valor: 90000 });
		expect(linha.output).toEqual({ parcela: 1234 });
	});

	it("tool que estoura emite a linha de ERRO — o caso que mais precisa de rastro", async () => {
		const tool = toLangChainTool(
			"search_groups",
			toolFake(async () => {
				throw new Error("Bevi fora do ar");
			}),
			CONV,
		);

		await expect(tool.invoke({ valor: 1 })).rejects.toThrow("Bevi fora do ar");

		const linha = linhaDeToolIo(erros);
		expect(linha).toBeTruthy();
		expect(linha.tool).toBe("search_groups");
		expect(linha.error).toContain("Bevi fora do ar");
	});

	it("sem conversa (caminho admin/preview) ainda loga, com conversation_id nulo", async () => {
		const tool = toLangChainTool(
			"recommend_groups",
			toolFake(async () => ({ ok: true })),
		);

		await tool.invoke({ valor: 5 });

		const linha = linhaDeToolIo(logs);
		expect(linha.conversation_id).toBeNull();
	});
});
