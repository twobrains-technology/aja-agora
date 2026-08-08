// Prompt Management com rede de segurança. Só os textos-base ESTÁVEIS são
// versionados no Langfuse (label `production`); os blocos dinâmicos do
// montarSystem são função do estado do funil e continuam código. O fallback é
// a constante do código, SEMPRE — Langfuse fora do ar nunca derruba o app.
// Cache TTL 60s = "edite na UI, o app pega em ≤60s sem deploy".
import type { TextPromptClient } from "@langfuse/client";
import { getLangfuseClient } from "./client";

export const PROMPT_NAMES = {
	system: "aja-system-prompt",
	analyzer: "aja-turn-analyzer",
} as const;

export type ManagedPrompt = {
	text: string;
	/** Client do prompt gerenciado — vai no metadata da generation pra linkar a
	 * VERSÃO usada. `null` quando o texto veio do fallback (fallback não tem
	 * versão; linkar mentiria a métrica por versão). */
	lfPrompt: TextPromptClient | null;
};

export async function fetchManagedPrompt(
	name: string,
	fallbackText: string,
): Promise<ManagedPrompt> {
	const langfuse = getLangfuseClient();
	if (!langfuse) return { text: fallbackText, lfPrompt: null };
	try {
		const prompt = await langfuse.prompt.get(name, {
			label: "production",
			cacheTtlSeconds: 60,
			fallback: fallbackText,
			type: "text",
			fetchTimeoutMs: 2_000,
		});
		if (prompt.isFallback) return { text: prompt.prompt, lfPrompt: null };
		return { text: prompt.prompt, lfPrompt: prompt };
	} catch (err) {
		console.error(`[langfuse] prompt "${name}" indisponível — usando fallback do código:`, err);
		return { text: fallbackText, lfPrompt: null };
	}
}
