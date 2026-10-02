/**
 * B15 (FIX-435, limpeza) — o builder tem que usar a fábrica única de modelo.
 *
 * O defeito medido na revisão C15: `builder.ts` montava o modelo com
 * `process.env.AI_MODEL ?? "claude-sonnet-5"`. O compose materializa
 * `${AI_MODEL:-}` como STRING VAZIA, e `??` só cai no default com `null`/
 * `undefined` — então `AI_MODEL=""` virava o modelo `""`, não o padrão.
 * Mesmo footgun já documentado em `gateway-anthropic.ts` e resolvido no
 * `modeloDoAgente()` (`?.trim() || default`).
 *
 * O teste captura as settings que o builder entrega ao `ToolLoopAgent` (a
 * classe é mockada para não instanciar nada de rede) e lê o `modelId` do
 * modelo instanciado — a mesma medida do `model-provider.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELO_DO_AGENTE_PADRAO } from "@/lib/llm/model-provider";
import type { PersonaRow } from "../system-prompt";

const { settingsCapturadas } = vi.hoisted(() => ({
	settingsCapturadas: [] as Array<Record<string, unknown>>,
}));

vi.mock("ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ai")>();
	class ToolLoopAgentFalso {
		settings: Record<string, unknown>;
		constructor(settings: Record<string, unknown>) {
			this.settings = settings;
			settingsCapturadas.push(settings);
		}
	}
	return {
		...actual,
		ToolLoopAgent: ToolLoopAgentFalso as unknown as typeof actual.ToolLoopAgent,
	};
});

import { buildAgent } from "./builder";

/** Row mínima de concierge: o caminho de modelo é o mesmo do specialist, e o
 * concierge não monta o toolset — o teste mede o MODELO, não a persona. */
function personaConcierge(): PersonaRow {
	return {
		id: "concierge-teste",
		displayName: "Concierge",
		role: "concierge",
		category: "auto",
		expertise: null,
		voiceTone: "Neutra.",
		examples: [],
		temperature: 0.7,
		activeCampaigns: [],
		handoffTriggers: [],
		forbiddenTopics: [],
		activeTools: [],
		isActive: true,
		version: 1,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
	};
}

function modelIdCapturado(): string | undefined {
	const model = settingsCapturadas[0]?.model as { modelId?: string } | undefined;
	return model?.modelId;
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("buildAgent — modelo do gateway (B15)", () => {
	it("com AI_MODEL vazio (compose), usa o modelo padrão — não string vazia", () => {
		vi.stubEnv("AI_MODEL", "   ");
		settingsCapturadas.length = 0;
		buildAgent(personaConcierge());
		expect(settingsCapturadas).toHaveLength(1);
		expect(modelIdCapturado()).toBe(MODELO_DO_AGENTE_PADRAO);
	});

	it("com AI_MODEL setado, usa o modelo da env", () => {
		vi.stubEnv("AI_MODEL", "qwen3.8-flash");
		settingsCapturadas.length = 0;
		buildAgent(personaConcierge());
		expect(modelIdCapturado()).toBe("qwen3.8-flash");
	});
});
