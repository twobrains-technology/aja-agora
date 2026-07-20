// FIX-356 — spike de fundação: prova que `ChatAnthropic` (LangChain), via o
// MESMO gateway LiteLLM (SRV-fetch, `resolveGatewayHost`/`gatewayFetch`
// reusados de gateway-anthropic.ts), resolve o alias `claude-sonnet-5` e faz
// tool-calling NATIVO (passthrough Anthropic) com sucesso.
//
// É o GATE DE FUNDAÇÃO da campanha: se isto não passar quando o gateway
// estiver alcançável, o provider trocaria pra OpenAI-compat (/v1/chat/
// completions) — replaneja ANTES de construir o grafo (goal doc, ITEM 0A).
//
// `describe.skipIf` — NÃO trava o build/CI quando o gateway está fora
// (cota Anthropic direta estourada até 01/08; o gateway shared só é
// alcançável via túnel SSM, que o Kairo abre manualmente na verificação).
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { tool } from "@langchain/core/tools";
import { resolveGatewayHost } from "@/lib/llm/gateway-anthropic";
import { makeLangGraphModel } from "./provider";

const PROBE_TIMEOUT_MS = 3_000;

/** Checa alcançabilidade de VERDADE (HTTP round-trip real, timeout curto) —
 * não basta `resolveGatewayHost()` devolver um host CONFIGURADO
 * (LITELLM_BASE_URL pode apontar pro túnel SSM que caiu sozinho, memória
 * `project_aja_llm_local_via_tunel_ssm`) nem um TCP connect bem-sucedido
 * (achado ao vivo, 2026-07-20: depois de matar a sessão SSM, o socket ainda
 * "conectava" no host.docker.internal:4000 — meio-aberto/zumbi via
 * proxy do OrbStack — e só a REQUISIÇÃO HTTP de verdade expunha que não
 * havia ninguém respondendo do outro lado). Sem este probe, o spike pendurava
 * até o teto do teste (30s) em vez de pular (skipIf) em segundos. */
async function gatewayReachable(): Promise<boolean> {
	try {
		const host = await resolveGatewayHost();
		if (!host) return false;
		const res = await fetch(`http://${host}/health/liveliness`, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		return res.status < 500;
	} catch {
		return false;
	}
}

const reachable = await gatewayReachable();

describe.skipIf(!reachable)(
	"FIX-356 — spike: ChatAnthropic via gateway LiteLLM + tool-call nativo",
	() => {
		it("resolve claude-sonnet-5 e volta com 1 tool_call resolvido", async () => {
			const getWeather = tool(
				async ({ city }: { city: string }) => `Ensolarado em ${city}, 28°C.`,
				{
					name: "get_weather",
					description: "Consulta o clima atual de uma cidade.",
					schema: z.object({ city: z.string().describe("Nome da cidade") }),
				},
			);

			const model = makeLangGraphModel().bindTools([getWeather]);
			const response = await model.invoke(
				[
					{
						role: "user",
						content:
							"Qual o clima em Fortaleza agora? Use SEMPRE a tool get_weather pra responder — nunca invente.",
					},
				],
				{ signal: AbortSignal.timeout(15_000) },
			);

			console.log("[FIX-356 spike] resposta do modelo:", JSON.stringify(response, null, 2));
			console.log(
				"[FIX-356 spike] tool_calls parseados:",
				JSON.stringify(response.tool_calls, null, 2),
			);

			expect(response.tool_calls?.length).toBeGreaterThan(0);
			expect(response.tool_calls?.[0]?.name).toBe("get_weather");
		}, 20_000);
	},
);

describe.skipIf(reachable)("FIX-356 — spike (gateway inalcançável neste ambiente)", () => {
	it("documenta o skip — ver .done/ do bloco pra status da validação", () => {
		expect(reachable).toBe(false);
	});
});
