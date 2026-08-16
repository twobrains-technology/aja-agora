/**
 * "O agente em produção está rodando o prompt que está no repo?"
 *
 * Compara o texto do CÓDIGO com a versão de label `production` no Langfuse e
 * FALHA (exit 1) se divergirem. É o sinal que não existia em 2026-08-15, quando
 * o `aja-turn-analyzer` estava publicado na v1 de 07/08 enquanto o código, desde
 * 14/08, já tinha os exemplos que separam parcela de valor do bem — e ninguém
 * tinha como saber, porque o runtime lê o Langfuse e só usa o código como
 * fallback (ver `src/lib/observability/langfuse/prompts.ts`).
 *
 * Uso:
 *   pnpm prompts:check
 *
 * A lógica de comparação é pura e testada em `prompt-drift.test.ts`; aqui só
 * entra a busca (rede) e a saída.
 *
 * ⚠️ A instância importa: o `.env.local` costuma apontar para a LOCAL. Checar a
 * instância errada dá verde sem significar nada — por isso a URL é sempre
 * impressa antes do veredito.
 */
import "./_env-host";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { BASE_SYSTEM_INSTRUCTION } from "@/lib/agent/turn-analyzer";
import { getLangfuseClient } from "@/lib/observability/langfuse/client";
import {
	compararPromptPublicado,
	type PromptDrift,
	resumoDeDrift,
} from "@/lib/observability/langfuse/prompt-drift";
import { PROMPT_NAMES } from "@/lib/observability/langfuse/prompts";

async function main(): Promise<void> {
	const client = getLangfuseClient();
	if (!client) {
		console.error("✗ LANGFUSE_* ausentes no ambiente — sem elas não há o que comparar.");
		process.exit(1);
	}

	console.log(
		`Instância verificada: ${process.env.LANGFUSE_BASE_URL ?? "(LANGFUSE_BASE_URL vazio)"}`,
	);

	const alvos: Array<{ name: string; text: string }> = [
		{ name: PROMPT_NAMES.system, text: SYSTEM_PROMPT },
		{ name: PROMPT_NAMES.analyzer, text: BASE_SYSTEM_INSTRUCTION },
	];

	const drifts: PromptDrift[] = [];
	for (const { name, text } of alvos) {
		let publicado: { text: string; version: number } | null = null;
		try {
			const atual = await client.prompt.get(name, {
				label: "production",
				cacheTtlSeconds: 0,
				type: "text",
			});
			// `isFallback` = o SDK devolveu o texto que passamos como fallback, não o
			// publicado. Aqui não passamos fallback, mas a guarda mantém o contrato
			// explícito: sem publicação, `publicado` fica null.
			if (!atual.isFallback) publicado = { text: atual.prompt, version: atual.version };
		} catch {
			// Prompt inexistente ou label vazia — é o caso "nao-publicado".
		}
		drifts.push(compararPromptPublicado({ name, textoDoCodigo: text, publicado }));
	}

	const { ok, texto } = resumoDeDrift(drifts);
	console.log(texto);
	process.exit(ok ? 0 : 1);
}

main();
