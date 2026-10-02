import type { LanguageModel } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isNativeAnthropicModel, modeloAiSdkDoGateway, modeloDoAgente } from "./model-provider";

// ============================================================================
// Bug real (2026-07-05): o gateway LiteLLM quebra `tool_choice` ao traduzir
// a rota Anthropic Messages (/v1/messages) pra um backend OpenAI-compatible
// custom (ex: Qwen via provider `openai/`). Modelos que não são nativos da
// Anthropic precisam ir pelo client OpenAI-compatible (que fala o formato
// nativo do backend, sem tradução), não pelo client Anthropic do gateway.
// ============================================================================

describe("isNativeAnthropicModel", () => {
	it("reconhece modelos claude-* como nativos da Anthropic", () => {
		expect(isNativeAnthropicModel("claude-sonnet-5")).toBe(true);
		expect(isNativeAnthropicModel("claude-haiku-4-5")).toBe(true);
		expect(isNativeAnthropicModel("claude-opus-4-8")).toBe(true);
	});

	it("NÃO reconhece modelos custom (ex: qwen) como nativos da Anthropic", () => {
		expect(isNativeAnthropicModel("qwen3.6-flash")).toBe(false);
	});
});

/** `LanguageModel` inclui id em string (o registry global do AI SDK). O que
 * este arquivo mede é o MODELO instanciado — a rota é uma propriedade dele. */
function providerDo(model: LanguageModel): string {
	if (typeof model === "string") {
		throw new Error("esperava um modelo instanciado, veio um id em string");
	}
	return model.provider;
}

afterEach(() => {
	vi.unstubAllEnvs();
});

// ============================================================================
// D5 (02/10/2026) — o analyzer passa a usar o MESMO modelo do agente, e a rota
// tem uma fábrica só. Ela existia duplicada em `builder.ts` e inline no
// `turn-analyzer.ts`; duas cópias da mesma decisão divergem em silêncio.
// ============================================================================
describe("modeloAiSdkDoGateway", () => {
	it("manda modelo custom (qwen) pelo client OpenAI-compatível do gateway", () => {
		// `/v1/chat/completions` — o caminho que NÃO traduz o `tool_choice` e por
		// isso não quebra com o qwen. `openai.responses` cairia na Responses API,
		// que o gateway LiteLLM não serve.
		expect(providerDo(modeloAiSdkDoGateway("qwen3.8-flash"))).toBe("openai.chat");
	});

	it("manda claude-* pelo provider Anthropic do gateway", () => {
		expect(providerDo(modeloAiSdkDoGateway("claude-haiku-4-5"))).toBe("anthropic.messages");
	});
});

describe("modeloDoAgente", () => {
	it("lê AI_MODEL", () => {
		vi.stubEnv("AI_MODEL", "qwen3.8-flash");
		expect(modeloDoAgente()).toBe("qwen3.8-flash");
	});

	it("apara espaço em volta do valor", () => {
		vi.stubEnv("AI_MODEL", "  qwen3.8-flash  ");
		expect(modeloDoAgente()).toBe("qwen3.8-flash");
	});

	it("cai no default com a var vazia (compose materializa var vazia)", () => {
		vi.stubEnv("AI_MODEL", "   ");
		expect(modeloDoAgente()).toBe("claude-sonnet-5");
	});

	it("cai no default com a var ausente", () => {
		vi.stubEnv("AI_MODEL", "");
		expect(modeloDoAgente()).toBe("claude-sonnet-5");
	});
});
