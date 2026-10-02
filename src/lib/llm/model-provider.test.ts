import type { LanguageModel } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isNativeAnthropicModel,
	modeloAiSdkDoGateway,
	modeloDoAgente,
	modeloDoAnalisador,
} from "./model-provider";

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

// ============================================================================
// B4c (02/10/2026) — o analyzer HERDA o modelo padrão e aceita override
// opcional. Precedência: AI_ANALYZER_MODEL → AI_MODEL → default do projeto.
// `?.trim() ||` em cada passo: o compose materializa var vazia, e vazio/espaços
// precisa cair para o próximo da cadeia, não virar modelo.
// ============================================================================
describe("modeloDoAnalisador", () => {
	it("o override do analyzer vence o modelo do agente", () => {
		vi.stubEnv("AI_ANALYZER_MODEL", "claude-haiku-4-5");
		vi.stubEnv("AI_MODEL", "qwen3.8-flash");
		expect(modeloDoAnalisador()).toBe("claude-haiku-4-5");
	});

	it("sem override, herda AI_MODEL", () => {
		vi.stubEnv("AI_ANALYZER_MODEL", "");
		vi.stubEnv("AI_MODEL", "qwen3.8-flash");
		expect(modeloDoAnalisador()).toBe("qwen3.8-flash");
	});

	it("sem override e sem AI_MODEL, cai no default do projeto", () => {
		vi.stubEnv("AI_ANALYZER_MODEL", "");
		vi.stubEnv("AI_MODEL", "");
		expect(modeloDoAnalisador()).toBe("claude-sonnet-5");
	});

	it("apara espaço em volta do override", () => {
		vi.stubEnv("AI_ANALYZER_MODEL", "  claude-haiku-4-5  ");
		vi.stubEnv("AI_MODEL", "qwen3.8-flash");
		expect(modeloDoAnalisador()).toBe("claude-haiku-4-5");
	});

	it("override vazio (compose) cai para AI_MODEL", () => {
		vi.stubEnv("AI_ANALYZER_MODEL", "   ");
		vi.stubEnv("AI_MODEL", "qwen3.8-flash");
		expect(modeloDoAnalisador()).toBe("qwen3.8-flash");
	});

	it("AI_MODEL vazio sem override cai no default do projeto", () => {
		vi.stubEnv("AI_ANALYZER_MODEL", "");
		vi.stubEnv("AI_MODEL", "   ");
		expect(modeloDoAnalisador()).toBe("claude-sonnet-5");
	});
});
