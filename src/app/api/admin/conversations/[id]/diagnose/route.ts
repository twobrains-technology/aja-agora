import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationEvaluations, conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { getPersonaForAdmin } from "@/lib/agent/personas-repo";
import { DiagnosisError, diagnoseConversation } from "@/lib/diagnose/diagnose";
import { DIAGNOSIS_VERSION, type PersonaSnapshot } from "@/lib/diagnose/prompt";
import { buildTranscript } from "@/lib/eval/transcript";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O retrato da persona que vai no prompt do diagnóstico.
 *
 * Persona é opcional desde o vendedor livre (mandato 2026-10-20): conversa sem
 * categoria clicada e sem persona no `metadata` existe e PRECISA ser diagnosticável —
 * antes disto a rota respondia 422 e o operador não tinha o que corrigir. Sem persona,
 * o snapshot vai com os campos vazios e o diagnóstico olha a conversa (nota, dimensões,
 * flags) em vez de comparar com um estado de persona que não existe.
 */
export function snapshotDaPersona(
	persona: Awaited<ReturnType<typeof getPersonaForAdmin>> | null,
): PersonaSnapshot {
	if (!persona) {
		return {
			id: "(sem persona)",
			displayName: "(sem persona — conversa sem persona ativa)",
			voiceTone: "(não definido)",
			examples: [],
			forbiddenTopics: [],
			handoffTriggers: [],
		};
	}
	return {
		id: persona.id,
		displayName: persona.displayName,
		voiceTone: persona.voiceTone,
		examples: persona.examples,
		forbiddenTopics: persona.forbiddenTopics,
		handoffTriggers: persona.handoffTriggers,
	};
}

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

	let personaRow: Awaited<ReturnType<typeof getPersonaForAdmin>> | null = null;
	if (personaId) {
		try {
			personaRow = await getPersonaForAdmin(personaId);
		} catch {
			// Persona removida depois da conversa (ou id legado): segue sem ela, como o
			// eval já faz em `eval/scorer.ts`. O diagnóstico é da conversa, não da persona.
			console.warn(`[diagnose] persona "${personaId}" não encontrada — diagnosticando sem ela`);
		}
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

	const personaSnapshot: PersonaSnapshot = snapshotDaPersona(personaRow);

	try {
		const out = await diagnoseConversation({
			transcript,
			// A conversa é a chave do livro-caixa local: sem ela o custo desta chamada
			// não aparece em lugar nenhum (P314).
			conversationId,
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
				personaId: personaRow?.id ?? null,
				evaluationId: evaluation.id,
			},
		});
	} catch (err) {
		console.error(`[diagnose] failed for conversation=${conversationId}:`, err);
		const message = err instanceof DiagnosisError ? err.message : "Erro desconhecido";
		return Response.json({ error: `Falha ao diagnosticar: ${message}` }, { status: 502 });
	}
}
