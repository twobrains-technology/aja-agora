import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationEvaluations, conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { getPersonaForAdmin } from "@/lib/agent/personas-repo";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { DiagnosisError, diagnoseConversation } from "@/lib/diagnose/diagnose";
import { DIAGNOSIS_VERSION, type PersonaSnapshot } from "@/lib/diagnose/prompt";
import { buildTranscript } from "@/lib/eval/transcript";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	// Diagnóstico aplica em persona (escrita) — admin-only é mais coerente que
	// liberar pra atendente, mesmo que o endpoint só LEIA. Custa $0.01-0.02 por
	// chamada, então o gate de acesso também é gate de custo.
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id: conversationId } = await params;
	if (!UUID_RE.test(conversationId)) {
		return Response.json({ error: "Invalid conversation ID format" }, { status: 400 });
	}

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		with: {
			messages: {
				orderBy: (m, { asc }) => [asc(m.createdAt)],
				with: { artifacts: true },
			},
		},
	});

	if (!conv) {
		return Response.json({ error: "Conversa não encontrada" }, { status: 404 });
	}

	const evaluation = await db.query.conversationEvaluations.findFirst({
		where: eq(conversationEvaluations.conversationId, conversationId),
		orderBy: [desc(conversationEvaluations.evaluatedAt)],
	});

	if (!evaluation) {
		return Response.json(
			{
				error: "Conversa ainda não avaliada",
				reason: "Gere a avaliação antes de diagnosticar.",
			},
			{ status: 422 },
		);
	}

	const metadata = (conv.metadata ?? null) as ConversationMetadata | null;
	const personaId = evaluation.personaId ?? metadata?.currentPersona ?? null;

	if (!personaId) {
		return Response.json(
			{ error: "Sem persona ativa na conversa — não dá pra diagnosticar." },
			{ status: 422 },
		);
	}

	let personaRow: Awaited<ReturnType<typeof getPersonaForAdmin>>;
	try {
		personaRow = await getPersonaForAdmin(personaId);
	} catch {
		return Response.json(
			{ error: `Persona "${personaId}" não encontrada — pode ter sido removida.` },
			{ status: 422 },
		);
	}

	const transcript = buildTranscript({
		status: conv.status,
		channel: conv.channel,
		currentPersona: metadata?.currentPersona ?? null,
		currentCategory: metadata?.currentCategory ?? null,
		messages: conv.messages.map((m) => ({
			id: m.id,
			role: m.role,
			content: m.content,
			createdAt: m.createdAt,
			personaId: m.personaId,
		})),
		artifacts: conv.messages.flatMap((m) =>
			m.artifacts.map((a) => ({
				messageId: a.messageId,
				type: a.type,
				payload: a.payload as Record<string, unknown>,
			})),
		),
	});

	const personaSnapshot: PersonaSnapshot = {
		id: personaRow.id,
		displayName: personaRow.displayName,
		voiceTone: personaRow.voiceTone,
		examples: personaRow.examples,
		forbiddenTopics: personaRow.forbiddenTopics,
		handoffTriggers: personaRow.handoffTriggers,
	};

	try {
		const out = await diagnoseConversation({
			transcript,
			evaluation: {
				overallScore: evaluation.overallScore !== null ? Number(evaluation.overallScore) : null,
				dimensions: evaluation.dimensions,
				flags: evaluation.flags,
				topIssues: evaluation.topIssues,
				topStrengths: evaluation.topStrengths,
			},
			persona: personaSnapshot,
			context: {
				expertise: metadata?.expertiseLevel ?? null,
				category: metadata?.currentCategory ?? null,
				channel: conv.channel,
				intent: null, // Sem snapshot histórico do intent; reservado pra futuro.
			},
		});

		return Response.json({
			diagnosis: out.result,
			meta: {
				diagnosisVersion: DIAGNOSIS_VERSION,
				tokensInput: out.tokensInput,
				tokensOutput: out.tokensOutput,
				durationMs: out.durationMs,
				personaId: personaSnapshot.id,
				evaluationId: evaluation.id,
			},
		});
	} catch (err) {
		console.error(`[diagnose] failed for conversation=${conversationId}:`, err);
		const message = err instanceof DiagnosisError ? err.message : "Erro desconhecido";
		return Response.json({ error: `Falha ao diagnosticar: ${message}` }, { status: 502 });
	}
}
