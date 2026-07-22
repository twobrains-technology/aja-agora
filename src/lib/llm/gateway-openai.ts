// src/lib/llm/gateway-openai.ts
//
// Provider OpenAI-compatible roteado pelo gateway LiteLLM, pra modelos custom
// (ex: Qwen) que NÃO são nativos da Anthropic. O gateway LiteLLM quebra o
// `tool_choice` ao traduzir a rota Anthropic Messages (/v1/messages) pra um
// backend `openai/`-compatible — falando o formato OpenAI direto (/chat/
// completions) isso não acontece (ver qwen-gateway-provider.test.ts).

import dns from "node:dns/promises";
import { createOpenAI } from "@ai-sdk/openai";

const SRV_CACHE_TTL_MS = 30_000;
let _cache: { host: string; expiresAt: number } | null = null;

async function resolveGatewayHost(): Promise<string | null> {
	const srv = process.env.LITELLM_SRV_NAME?.trim();
	if (!srv) {
		const direct = process.env.LITELLM_BASE_URL?.trim();
		if (!direct) return null;
		try {
			return new URL(direct).host;
		} catch {
			return null;
		}
	}
	if (_cache && Date.now() < _cache.expiresAt) return _cache.host;
	try {
		const records = await dns.resolveSrv(srv);
		if (records.length === 0) return null;
		const r = [...records].sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
		const ips = await dns.resolve4(r.name);
		if (ips.length === 0) return null;
		const host = `${ips[0]}:${r.port}`;
		_cache = { host, expiresAt: Date.now() + SRV_CACHE_TTL_MS };
		return host;
	} catch {
		return null;
	}
}

export function resetGatewayOpenAIHostCache(): void {
	_cache = null;
}

const gatewayFetch: typeof globalThis.fetch = async (input, init) => {
	const host = await resolveGatewayHost();
	if (!host) return fetch(input, init);
	const original = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
	try {
		const url = new URL(original);
		url.protocol = "http:";
		url.host = host;
		return fetch(url.toString(), init);
	} catch {
		return fetch(input, init);
	}
};

export function createGatewayOpenAI() {
	return createOpenAI({
		// `?.trim() ||`: string vazia (compose materializa var vazia) cai pro fallback.
		apiKey: process.env.LITELLM_API_KEY?.trim() || process.env.OPENAI_API_KEY,
		baseURL: `http://${process.env.LITELLM_SRV_NAME ?? "litellm-srv.tb.local:4000"}/v1`,
		fetch: gatewayFetch,
	});
}
