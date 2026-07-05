import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ============================================================================
// Bug real (2026-07-05): o gateway LiteLLM quebra `tool_choice` ("The tool
// specified in `tool_choice` does not match any of the specified `tools`")
// ao traduzir a rota Anthropic Messages (/v1/messages) pra um backend
// OpenAI-compatible custom (Qwen via provider `openai/`). Reproduzido direto
// contra o gateway: via /chat/completions (formato OpenAI puro) tools +
// tool_choice funcionam; via /v1/messages (formato Anthropic, o que o app
// sempre usava) quebra.
//
// Fix: builder.ts escolhe o client conforme o modelo — `claude-*` continua no
// client Anthropic (cache_control, thinking); qualquer outro (Qwen etc.) vai
// pelo client OpenAI-compatible, sem tradução.
//
// Teste estrutural (lê a fonte, sem DB/LLM) — nome evita o glob
// `builder*.test.ts` (excluído do test:unit) de propósito, pra gatear o merge.
// ============================================================================

const builderSrc = readFileSync("src/lib/agent/agents/builder.ts", "utf-8");

describe("builder.ts escolhe client por provider do modelo", () => {
	it("importa isNativeAnthropicModel e createGatewayOpenAI", () => {
		expect(builderSrc).toMatch(/isNativeAnthropicModel/);
		expect(builderSrc).toMatch(/createGatewayOpenAI/);
	});

	it("só aplica anthropicProviderOptions quando o modelo é nativo Anthropic", () => {
		expect(builderSrc).toMatch(/=\s*isNativeAnthropicModel\(/);
		expect(builderSrc).toMatch(/providerOptions:\s*anthropicProviderOptions/);
	});
});
