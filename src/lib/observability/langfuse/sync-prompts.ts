// Núcleo puro do `pnpm sync-prompts` (scripts/sync-prompts.ts): registra o
// texto do CÓDIGO como versão `production` no Langfuse, idempotente — texto
// idêntico não cria versão nova (deploy repetido não suja o histórico).
import type { LangfuseClient } from "@langfuse/client";

export async function syncPrompt(
	client: LangfuseClient,
	name: string,
	text: string,
): Promise<"created" | "unchanged"> {
	let current: string | null = null;
	try {
		const existing = await client.prompt.get(name, {
			label: "production",
			cacheTtlSeconds: 0,
			type: "text",
		});
		current = existing.prompt;
	} catch {
		// Prompt ainda não existe (ou label vazia) — segue pro create.
	}
	if (current === text) return "unchanged";
	await client.prompt.create({
		name,
		type: "text",
		prompt: text,
		labels: ["production"],
	});
	return "created";
}
