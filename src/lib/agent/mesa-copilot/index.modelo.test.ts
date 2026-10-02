/**
 * B15 (FIX-435, limpeza) — o copiloto de mesa usa a fábrica única de modelo.
 *
 * Mesmo defeito do `builder.ts`: `process.env.AI_MODEL ?? "claude-sonnet-5"`
 * não cai no default com a var vazia que o compose materializa. Aqui o
 * `streamText` é mockado para capturar o modelo efetivo sem tocar a rede.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELO_DO_AGENTE_PADRAO } from "@/lib/llm/model-provider";

const { argsCapturados } = vi.hoisted(() => ({
	argsCapturados: [] as Array<Record<string, unknown>>,
}));

vi.mock("ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ai")>();
	return {
		...actual,
		streamText: ((args: Record<string, unknown>) => {
			argsCapturados.push(args);
			return {
				textStream: (async function* () {
					yield "ok";
				})(),
			};
		}) as unknown as typeof actual.streamText,
	};
});

import { generateMesaCopilotReply } from "./index";

const CASO = { administradoraNome: null, docs: [] };

function modelIdCapturado(): string | undefined {
	const model = argsCapturados[0]?.model as { modelId?: string } | undefined;
	return model?.modelId;
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("generateMesaCopilotReply — modelo do gateway (B15)", () => {
	it("com AI_MODEL vazio (compose), usa o modelo padrão — não string vazia", async () => {
		vi.stubEnv("AI_MODEL", "   ");
		argsCapturados.length = 0;
		await generateMesaCopilotReply({
			caso: CASO,
			history: [{ role: "attendant", content: "como cadastro o cliente?" }],
		});
		expect(argsCapturados).toHaveLength(1);
		expect(modelIdCapturado()).toBe(MODELO_DO_AGENTE_PADRAO);
	});

	it("com AI_MODEL setado, usa o modelo da env", async () => {
		vi.stubEnv("AI_MODEL", "qwen3.8-flash");
		argsCapturados.length = 0;
		await generateMesaCopilotReply({
			caso: CASO,
			history: [{ role: "attendant", content: "como cadastro o cliente?" }],
		});
		expect(modelIdCapturado()).toBe("qwen3.8-flash");
	});
});
