// src/lib/llm/model-provider.ts
//
// Decide se um model id fala o dialeto nativo da Anthropic Messages API
// (`claude-*`) ou se é um modelo custom servido via provider OpenAI-compatible
// no gateway (ex: Qwen). Ver model-provider.test.ts pro bug que isso evita.
export function isNativeAnthropicModel(modelId: string): boolean {
	return modelId.startsWith("claude-");
}
