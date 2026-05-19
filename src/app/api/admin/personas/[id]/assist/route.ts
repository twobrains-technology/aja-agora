import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/admin/require-role";
import { buildAssistantPrompt } from "@/lib/agent/assistant-prompt";
import { rateLimit } from "@/lib/agent/assistant-rate-limit";
import { getPersonaForAdmin } from "@/lib/agent/personas-repo";
import { buildAssistantTools } from "@/lib/agent/tools/assistant-tools";

export const runtime = "nodejs";
export const maxDuration = 60;

// Spec sec 9 + plano D9: histórico limitado pra controlar custo de token.
// 12 turns = ~6 trocas de pergunta/resposta — suficiente pra desambiguar +
// aplicar 2-3 patches em 1 sessão. HARD_RULES.md custa ~3k tokens base.
const MAX_HISTORY = 12;

export async function POST(
	req: Request | NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const auth = await requireRole("admin");
	if (auth.error) return auth.error;

	const { id } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
	}

	const messages =
		(body as { messages?: unknown[] }).messages?.slice(-MAX_HISTORY) ?? [];

	const adminId = (auth.session?.user as { id?: string } | undefined)?.id;
	const limit = rateLimit(`assist:${adminId ?? "unknown"}`);
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "rate_limited", retryAfterMs: limit.retryAfterMs },
			{ status: 429 },
		);
	}

	let persona;
	try {
		persona = await getPersonaForAdmin(id);
	} catch {
		return NextResponse.json(
			{ error: "Persona não encontrada" },
			{ status: 404 },
		);
	}

	const tools = buildAssistantTools({
		personaId: persona.id,
		personaVersion: persona.version,
		role: persona.role as "concierge" | "specialist",
		category: persona.category,
		currentRow: {
			voiceTone: persona.voiceTone,
			examples: persona.examples,
			forbiddenTopics: persona.forbiddenTopics,
			handoffTriggers: persona.handoffTriggers,
		},
		// Fecha race window do stream — quando IA emite propose_patch
		// depois de 5-30s de geração, server re-lê version do DB. Se
		// outro admin bumpou no meio, patch é rejeitado.
		refreshVersion: async () => {
			const fresh = await getPersonaForAdmin(persona.id);
			return fresh.version;
		},
	});

	// biome-ignore lint/suspicious/noExplicitAny: messages from useChat
	const modelMessages = await convertToModelMessages(messages as any);

	const result = streamText({
		model: anthropic("claude-sonnet-4-6"),
		system: buildAssistantPrompt({
			id: persona.id,
			displayName: persona.displayName,
			role: persona.role as "concierge" | "specialist",
			category: persona.category,
			expertise: persona.expertise,
			voiceTone: persona.voiceTone,
			examples: persona.examples,
			forbiddenTopics: persona.forbiddenTopics,
			handoffTriggers: persona.handoffTriggers,
			version: persona.version,
		}),
		messages: modelMessages,
		tools,
		stopWhen: stepCountIs(6),
		temperature: 0.4,
	});

	return result.toUIMessageStreamResponse();
}
