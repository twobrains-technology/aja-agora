import type { Tool as AiSdkTool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toPiTool, toPiTools } from "./tools";

function toolFalso(chamadas: unknown[]): AiSdkTool {
	return {
		description: "dobra um número",
		inputSchema: z.object({ x: z.number() }),
		execute: async (input: { x: number }) => {
			chamadas.push(input);
			return { dobro: input.x * 2 };
		},
	} as unknown as AiSdkTool;
}

describe("pi/tools — a tool de negócio roda a MESMA implementação", () => {
	it("executa o execute original e devolve o resultado como texto pro modelo", async () => {
		const chamadas: unknown[] = [];
		const def = toPiTool("dobrar", toolFalso(chamadas));

		const r = await def.execute("call-1", { x: 21 });

		expect(chamadas).toEqual([{ x: 21 }]);
		expect(r.content[0].text).toBe(JSON.stringify({ dobro: 42 }));
		expect(def.name).toBe("dobrar");
		expect(def.description).toBe("dobra um número");
	});

	it("o schema vira JSON Schema com os campos — é o que o modelo lê", () => {
		const def = toPiTool("dobrar", toolFalso([]));
		const schema = def.parameters as { type: string; properties?: Record<string, unknown> };
		expect(schema.type).toBe("object");
		expect(Object.keys(schema.properties ?? {})).toEqual(["x"]);
	});

	it("parâmetro errado NÃO chega na tool — o zod barra e o modelo fica sabendo", async () => {
		const chamadas: unknown[] = [];
		const def = toPiTool("dobrar", toolFalso(chamadas));

		const r = await def.execute("call-2", { x: "vinte e um" });

		expect(chamadas).toEqual([]);
		expect(r.content[0].text).toContain("erro na tool dobrar");
	});

	it("tool que estoura devolve erro como TEXTO em vez de derrubar o turno", async () => {
		const quebrada = {
			description: "quebra",
			inputSchema: z.object({}),
			execute: async () => {
				throw new Error("Bevi fora do ar");
			},
		} as unknown as AiSdkTool;

		const r = await toPiTool("quebrada", quebrada).execute("call-3", {});

		expect(r.content[0].text).toContain("Bevi fora do ar");
	});

	it("`so` limita o conjunto e ignora nome que não existe", () => {
		const tools = { a: toolFalso([]), b: toolFalso([]) } as unknown as Record<string, AiSdkTool>;
		const defs = toPiTools(tools, { so: ["a", "inexistente"] });
		expect(defs.map((d) => d.name)).toEqual(["a"]);
	});
});
