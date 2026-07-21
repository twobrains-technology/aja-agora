// Provider Anthropic (LangChain) do runtime LangGraph — reusa o MESMO
// caminho de rede do runtime Vercel (gateway LiteLLM shared, resolvido por
// SRV dinâmico, NUNCA base URL fixa). FIX-356 (fundação, campanha
// `.processo/loop/2026-07-20-1948-langgraph-runtime.md`).
//
// `gatewayFetch` (gateway-anthropic.ts) já faz a reescrita de host — é
// reusado tal-e-qual como `clientOptions.fetch`, sem duplicar a lógica de
// resolução SRV. Se o gateway não estiver configurado/alcançável, o próprio
// `gatewayFetch` cai pra Anthropic direta (mesmo fallback do caminho Vercel).
import { ChatAnthropic } from "@langchain/anthropic";
import { gatewayFetch } from "@/lib/llm/gateway-anthropic";

/** Espelha `builder.ts` (`AI_MODEL ?? "claude-sonnet-5"`), mas com
 * `?.trim() ||` — `??` NÃO cai pro fallback quando a env var existe vazia
 * (mesmo footgun documentado em gateway-anthropic.ts/docker-compose.yml: o
 * compose materializa a var mesmo sem valor). Sem temperature/thinking —
 * Sonnet-5 não aceita esses parâmetros (mesma nota do builder.ts Vercel). */
export function makeLangGraphModel(): ChatAnthropic {
	return new ChatAnthropic({
		model: process.env.AI_MODEL?.trim() || "claude-sonnet-5",
		apiKey: process.env.LITELLM_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY,
		clientOptions: { fetch: gatewayFetch },
	});
}

/** Bloco de texto do prompt marcado como estável (system/tools) — replica o
 * breakpoint `cache_control` que o caminho Vercel já aplica (builder.ts,
 * memória `anthropic_prompt_cache`). LangChain não seta isso sozinho: exige
 * o content-block explícito no formato bruto da API Anthropic.
 *
 * TODO(rodada-1): granularidade fina (múltiplos breakpoints por seção do
 * prompt, como o caminho Vercel faz) — nesta fundação, 1 breakpoint cobrindo
 * o bloco estável inteiro já evita a regressão de custo mais grosseira
 * (recomputar o prompt inteiro a cada turno). */
export function cacheableSystemBlock(text: string): {
	type: "text";
	text: string;
	cache_control: { type: "ephemeral" };
} {
	return { type: "text", text, cache_control: { type: "ephemeral" } };
}
