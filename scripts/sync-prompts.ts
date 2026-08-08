/**
 * Bootstrap idempotente do Prompt Management no Langfuse.
 *
 * Registra os textos-base ESTÁVEIS do código como versão com label
 * `production`: o SYSTEM_PROMPT do agente e o system do turn-analyzer. Os
 * blocos dinâmicos (montarSystem, sub-tópicos) são função do estado — ficam
 * no código, fora do versionamento.
 *
 * Idempotente: texto idêntico à versão `production` atual ⇒ não cria nada.
 *
 * Uso:
 *   pnpm sync-prompts            # dentro OU fora do container (env-host resolve DNS)
 *
 * Exige LANGFUSE_BASE_URL/PUBLIC_KEY/SECRET_KEY no .env.local — sem elas o
 * script FALHA ALTO (diferente do runtime, que degrada): rodar o sync sem
 * chave é sempre engano de operação.
 */
import "./_env-host";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { BASE_SYSTEM_INSTRUCTION } from "@/lib/agent/turn-analyzer";
import { getLangfuseClient } from "@/lib/observability/langfuse/client";
import { PROMPT_NAMES } from "@/lib/observability/langfuse/prompts";
import { syncPrompt } from "@/lib/observability/langfuse/sync-prompts";

async function main(): Promise<void> {
	const client = getLangfuseClient();
	if (!client) {
		console.error("✗ LANGFUSE_* ausentes no ambiente — configure o .env.local antes do sync.");
		process.exit(1);
	}

	const alvos: Array<{ name: string; text: string }> = [
		{ name: PROMPT_NAMES.system, text: SYSTEM_PROMPT },
		{ name: PROMPT_NAMES.analyzer, text: BASE_SYSTEM_INSTRUCTION },
	];

	let falhas = 0;
	for (const { name, text } of alvos) {
		try {
			const result = await syncPrompt(client, name, text);
			console.log(`${result === "created" ? "✓ versão nova" : "= sem mudança"}  ${name}`);
		} catch (err) {
			falhas++;
			console.error(`✗ falhou  ${name}:`, err);
		}
	}
	process.exit(falhas > 0 ? 1 : 0);
}

main();
