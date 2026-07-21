// FIX-357 — regressão exigida do card: round-trip do tool-adapter. Prova que
// `toLangChainTool` embrulha 1 tool AI-SDK numa `DynamicStructuredTool` cujo
// `.invoke()` executa o `execute` ORIGINAL (mesma lógica, mesmo resultado) —
// invariante ESTRUTURAL, não comportamento de nenhuma tool específica.
import { tool } from "ai";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { buildLangGraphTools, toLangChainTool } from "./tool-adapter";

describe("FIX-357 — tool-adapter: toLangChainTool", () => {
	it(".invoke() executa o execute ORIGINAL da tool AI-SDK e devolve o mesmo resultado", async () => {
		const executeSpy = vi.fn(async ({ city }: { city: string }) => ({
			city,
			forecast: "ensolarado",
		}));
		const aiSdkTool = tool({
			description: "Consulta o clima de uma cidade",
			inputSchema: z.object({ city: z.string() }),
			execute: executeSpy,
		});

		const lcTool = toLangChainTool("get_weather", aiSdkTool);

		expect(lcTool).toBeInstanceOf(DynamicStructuredTool);
		expect(lcTool.name).toBe("get_weather");
		expect(lcTool.description).toBe("Consulta o clima de uma cidade");

		const result = await lcTool.invoke({ city: "Fortaleza" });

		expect(executeSpy).toHaveBeenCalledTimes(1);
		expect(executeSpy.mock.calls[0]?.[0]).toEqual({ city: "Fortaleza" });
		expect(result).toEqual({ city: "Fortaleza", forecast: "ensolarado" });
	});

	it("cada invocação recebe um toolCallId novo (rastreável, nunca reusado)", async () => {
		const seenIds: string[] = [];
		const aiSdkTool = tool({
			description: "eco o toolCallId recebido",
			inputSchema: z.object({}),
			execute: async (_input, opts) => {
				seenIds.push(opts.toolCallId);
				return opts.toolCallId;
			},
		});
		const lcTool = toLangChainTool("echo_tool_call_id", aiSdkTool);

		await lcTool.invoke({});
		await lcTool.invoke({});

		expect(seenIds).toHaveLength(2);
		expect(seenIds[0]).not.toBe(seenIds[1]);
	});

	it("tool sem execute lança erro claro (não pode virar DynamicStructuredTool)", () => {
		const aiSdkTool = tool({
			description: "sem execute",
			inputSchema: z.object({}),
		});

		expect(() => toLangChainTool("sem_execute", aiSdkTool)).toThrow(/não tem execute/);
	});
});

describe("FIX-357 — buildLangGraphTools: registry completo em formato LangChain", () => {
	it("mapeia todas as tools de buildConsorcioTools (mesmo registry do runtime Vercel)", () => {
		const tools = buildLangGraphTools({ conversationId: "00000000-0000-4000-8000-000000000099" });

		expect(Object.keys(tools).length).toBeGreaterThan(10);
		expect(tools.search_groups).toBeInstanceOf(DynamicStructuredTool);
		expect(tools.recommend_groups).toBeInstanceOf(DynamicStructuredTool);
		expect(tools.simulate_quota).toBeInstanceOf(DynamicStructuredTool);
	});
});
