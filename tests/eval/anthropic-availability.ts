// Probe de disponibilidade da API Anthropic pra Camada 3 (eval com LLM real).
//
// Motivo (2026-06-05): a cota mensal do workspace esgotou NO MEIO de uma
// sessão de trabalho ("You have reached your specified workspace API usage
// limits. You will regain access on 2026-07-01"). O eval cirúrgico do
// pre-commit começou a falhar por INDISPONIBILIDADE EXTERNA — que não diz
// NADA sobre o código — bloqueando todo commit que toca src/lib/agent/**.
//
// Política: indisponibilidade externa (cota esgotada, 429, 5xx, rede) →
// suite PULA com warning gritante (Camada 3 fica inconclusiva, não verde).
// Qualquer outra resposta → testes rodam normal e falham com o erro real.
// Isto NUNCA mascara falha de assert — só evita confundir "API fora" com
// "regressão de comportamento".

export interface AnthropicAvailability {
	ok: boolean;
	reason?: string;
}

export async function anthropicAvailable(): Promise<AnthropicAvailability> {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) return { ok: false, reason: "ANTHROPIC_API_KEY ausente" };
	try {
		const res = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"x-api-key": key,
				"anthropic-version": "2023-06-01",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: "claude-haiku-4-5",
				max_tokens: 1,
				messages: [{ role: "user", content: "ping" }],
			}),
		});
		if (res.ok) return { ok: true };
		const body = await res.text();
		if (body.includes("usage limits")) {
			return {
				ok: false,
				reason: `cota do workspace Anthropic esgotada — ${body.slice(0, 200)}`,
			};
		}
		if (res.status === 429 || res.status >= 500) {
			return { ok: false, reason: `API Anthropic indisponível (HTTP ${res.status})` };
		}
		// Erro de request que NÃO é indisponibilidade (ex.: key inválida) —
		// deixa os testes rodarem e reportarem o erro real.
		return { ok: true };
	} catch (err) {
		return { ok: false, reason: `falha de rede ao sondar a API: ${err}` };
	}
}

/** Loga o motivo do skip de forma impossível de ignorar. */
export function warnEvalSkipped(suite: string, reason: string): void {
	console.warn(
		`\n${"⚠️ ".repeat(10)}\n[CAMADA 3 INCONCLUSIVA] ${suite}: eval com LLM real PULADO — ${reason}.\n` +
			"Isto NÃO é verde de verdade: re-rode quando a API voltar (nightly cobre).\n" +
			`${"⚠️ ".repeat(10)}\n`,
	);
}
