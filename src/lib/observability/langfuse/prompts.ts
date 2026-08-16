// Prompt Management com rede de segurança. Só os textos-base ESTÁVEIS são
// versionados no Langfuse (label `production`); os blocos dinâmicos do
// montarSystem são função do estado do funil e continuam código. O fallback é
// a constante do código, SEMPRE — Langfuse fora do ar nunca derruba o app.
// Cache TTL 60s = "edite na UI, o app pega em ≤60s sem deploy".
import type { TextPromptClient } from "@langfuse/client";
import { getLangfuseClient } from "./client";
import { ambienteLangfuse } from "./env";
import { scoreDeDesyncEmRuntime } from "./prompt-drift";

/** Já avisado nesta instância, por prompt — o cache do SDK é de 60s e o log
 * repetido a cada turno vira ruído, que é como um alarme real deixa de ser
 * lido. O score continua sendo emitido em todo turno divergente: é ele que dá a
 * dimensão temporal no painel. */
const jaAvisado = new Set<string>();

function reportarDesync(name: string, textoPublicado: string, textoDoCodigo: string): void {
	const score = scoreDeDesyncEmRuntime(name, textoPublicado, textoDoCodigo);
	if (!score) {
		jaAvisado.delete(name); // voltou a bater: o próximo desvio avisa de novo
		return;
	}
	if (!jaAvisado.has(name)) {
		jaAvisado.add(name);
		console.error(`[langfuse] ${score.comment}`);
	}
	try {
		getLangfuseClient()?.score.activeTrace({ ...score, environment: ambienteLangfuse() });
	} catch {
		// Score é observabilidade: nunca pode derrubar o turno do cliente.
	}
}

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

		// O modelo está recebendo o texto PUBLICADO. Se ele difere da constante do
		// código, o repo deixou de descrever o agente — e é aqui, com as duas
		// versões na mão, que dá para saber. Cobre as duas direções: código que
		// ninguém publicou, e texto editado na UI depois do último CI (esse muda o
		// agente em ≤60s, sem deploy e sem review).
		//
		// Em 2026-08-15 essa divergência existia havia 8 dias sem ninguém notar.
		reportarDesync(name, prompt.prompt, fallbackText);

		return { text: prompt.prompt, lfPrompt: prompt };
	} catch (err) {
		console.error(`[langfuse] prompt "${name}" indisponível — usando fallback do código:`, err);
		return { text: fallbackText, lfPrompt: null };
	}
}
