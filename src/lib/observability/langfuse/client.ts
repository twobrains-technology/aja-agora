// Singleton do LangfuseClient (prompts, scores, datasets). Null-safe por
// contrato: sem envs ⇒ null e quem chama pula — observabilidade nunca derruba
// o app.
import { LangfuseClient } from "@langfuse/client";
import { isLangfuseConfigured } from "./env";

let client: LangfuseClient | null = null;
let initialized = false;

export function getLangfuseClient(): LangfuseClient | null {
	if (initialized) return client;
	initialized = true;
	if (!isLangfuseConfigured()) return null;
	try {
		client = new LangfuseClient({
			publicKey: process.env.LANGFUSE_PUBLIC_KEY?.trim(),
			secretKey: process.env.LANGFUSE_SECRET_KEY?.trim(),
			baseUrl: process.env.LANGFUSE_BASE_URL?.trim(),
		});
	} catch (err) {
		console.error("[langfuse] falha ao criar client — observabilidade desligada:", err);
		client = null;
	}
	return client;
}

export function __resetLangfuseClientForTests(): void {
	client = null;
	initialized = false;
}
