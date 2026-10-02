// src/lib/llm/model-provider.ts
//
// Fábrica ÚNICA de modelo pro gateway LiteLLM. Antes desta função a mesma
// decisão de rota vivia em dois lugares (`builder.ts` e inline no
// `turn-analyzer.ts`) — duas cópias da mesma regra divergem em silêncio, e é
// exatamente a regra que quebra o `tool_choice` quando errada.
//
// Ver model-provider.test.ts pro bug que isso evita.
import type { LanguageModel } from "ai";
import { createGatewayAnthropic } from "./gateway-anthropic";
import { createGatewayOpenAI } from "./gateway-openai";

/** Modelo padrão do agente quando `AI_MODEL` não está setada. */
export const MODELO_DO_AGENTE_PADRAO = "claude-sonnet-5";

const anthropic = createGatewayAnthropic();
const openaiCompat = createGatewayOpenAI();

/**
 * Decide se um model id fala o dialeto nativo da Anthropic Messages API
 * (`claude-*`) ou se é um modelo custom servido via provider OpenAI-compatible
 * no gateway (ex: Qwen).
 */
export function isNativeAnthropicModel(modelId: string): boolean {
	return modelId.startsWith("claude-");
}

/**
 * O modelo do AGENTE — o mesmo para o runtime do grafo e para o turn-analyzer
 * (D5, 02/10/2026: "ajusta isso já pra ficar homogêneo"). `?.trim() ||` de
 * propósito: o compose materializa `${AI_MODEL:-}` como string VAZIA e `??`
 * não cairia no default (mesmo footgun documentado em gateway-anthropic.ts).
 */
export function modeloDoAgente(): string {
	return process.env.AI_MODEL?.trim() || MODELO_DO_AGENTE_PADRAO;
}

/**
 * Instancia um modelo do gateway pela rota certa:
 * `claude-*` → provider Anthropic (`/v1/messages`); o resto → client
 * OpenAI-compatible (`/v1/chat/completions`, via `.chat()` — a Responses API
 * não é servida pelo gateway).
 */
export function modeloAiSdkDoGateway(id: string): LanguageModel {
	return isNativeAnthropicModel(id) ? anthropic(id) : openaiCompat.chat(id);
}
