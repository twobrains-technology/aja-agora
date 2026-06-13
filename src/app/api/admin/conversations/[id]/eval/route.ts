import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationEvaluations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { scoreConversation } from "@/lib/eval/scorer";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { id: conversationId } = await params;

	if (!UUID_RE.test(conversationId)) {
		return Response.json({ error: "Invalid conversation ID format" }, { status: 400 });
	}

	const latest = await db.query.conversationEvaluations.findFirst({
		where: eq(conversationEvaluations.conversationId, conversationId),
		orderBy: [desc(conversationEvaluations.evaluatedAt)],
	});

	if (!latest) {
		return Response.json({ error: "Conversa ainda não avaliada" }, { status: 404 });
	}

	return Response.json({
		evaluation: latest,
		source: "stored",
	});
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { id: conversationId } = await params;

	if (!UUID_RE.test(conversationId)) {
		return Response.json({ error: "Invalid conversation ID format" }, { status: 400 });
	}

	try {
		// Disparo manual pelo admin é ação explícita — bypass da regra de inatividade.
		// Mantém o mínimo de turnos (regra estrutural — sem material o juiz não tem
		// o que avaliar). Conversa inexistente também segue retornando skipped.
		const outcome = await scoreConversation(conversationId, { forceImmediate: true });

		if (outcome.skipped) {
			return Response.json(
				{ error: "Conversa não elegível para avaliação", reason: outcome.reason },
				{ status: 422 },
			);
		}

		const stored = await db.query.conversationEvaluations.findFirst({
			where: eq(conversationEvaluations.id, outcome.evaluationId),
		});

		return Response.json({ evaluation: stored, source: "generated" });
	} catch (err) {
		console.error("[eval] Failed to score conversation:", err);
		const message = err instanceof Error ? err.message : "Erro desconhecido";
		return Response.json({ error: `Falha ao avaliar conversa: ${message}` }, { status: 500 });
	}
}
