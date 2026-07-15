// src/lib/llm/gateway-anthropic.ts
//
// Provider Anthropic roteado pelo gateway LiteLLM (litellm-srv.tb.local).
// Drop-in pra `createAnthropic()`: os pontos de uso (`anthropic(model)`) não mudam.
// O custom fetch resolve o SRV (Cloud Map, cache 30s) e reescreve só o host da
// URL pro gateway, mantendo o path /v1/messages. Se o gateway não está
// configurado/alcançável, vai direto pra Anthropic (fallback exige ANTHROPIC_API_KEY viva).
import { createAnthropic } from "@ai-sdk/anthropic";
import dns from "node:dns/promises";

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

export function resetGatewayHostCache(): void {
	_cache = null;
}

const gatewayFetch: typeof globalThis.fetch = async (input, init) => {
	const host = await resolveGatewayHost();
	if (!host) return fetch(input, init);
	const original =
		typeof input === "string" || input instanceof URL ? input.toString() : input.url;
	try {
		const url = new URL(original);
		url.protocol = "http:";
		url.host = host;
		return fetch(url.toString(), init);
	} catch {
		return fetch(input, init);
	}
};

export function createGatewayAnthropic() {
	return createAnthropic({
		// `?.trim() ||` (não `??`): compose materializa a var mesmo vazia; string
		// vazia tem que cair pro fallback, senão o gateway recebe key vazia e 401.
		apiKey: process.env.LITELLM_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY,
		fetch: gatewayFetch,
	});
}

/** Singleton default — pra quem importava `{ anthropic }` direto do SDK. */
export const anthropic = createGatewayAnthropic();
