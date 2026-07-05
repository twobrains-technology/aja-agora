import { describe, expect, it } from "vitest";
import { isNativeAnthropicModel } from "./model-provider";

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
