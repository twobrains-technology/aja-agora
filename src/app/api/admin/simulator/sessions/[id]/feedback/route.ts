/**
 * Feedback humano (👍/👎) de uma conversa do SIMULADOR — a nota do operador sobre
 * o que o vendedor fez.
 *
 * Onde isso morava: score enviado ao Langfuse (`user_feedback`, BOOLEAN 1/0), no
 * TURNO quando a UI mandasse `traceId` (`data-trace`), senão na conversa. Com o
 * Langfuse fora, sobrava uma linha de stdout e a avaliação do operador não ficava
 * guardada em lugar nenhum (L42/P313) — `publicarScores` continua sendo emitido,
 * mas agora é o ESPELHO do registro, não o registro.
 *
 * O registro é a linha em `sinais_de_conversa`: uma por avaliação, com a conversa,
 * o turno (`trace_id`) quando houver, o valor, o comentário e quem avaliou. O GET
 * devolve a série da conversa em ordem cronológica inversa.
 *
 * Leis: o sinal em stdout é best-effort e nunca derruba o pedido; a LINHA é o dado
 * que o operador pediu para guardar — se ela não entra, a rota falha em vez de
 * dizer `{ ok:true }` e perder a avaliação em silêncio. Dev-only: 404 em produção
 * via `isSimulatorEnabled()`.
 */
import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { conversations, sinaisDeConversa } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { publicarScores } from "@/lib/observability/sinais/publicar";
import { isSimulatorEnabled } from "@/lib/utils/env";

const bodySchema = z.object({
	value: z.enum(["up", "down"]),
	traceId: z.string().min(1).optional(),
	comment: z.string().max(500).optional(),
});

/** De onde nasce este sinal — o que gerou a linha. */
const ORIGEM = "simulador";
const NOME_DO_FEEDBACK = "user_feedback";

async function sessaoSimulada(id: string) {
	return db.query.conversations.findFirst({
		where: and(eq(conversations.id, id), eq(conversations.isSimulated, true)),
	});
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error, session } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const conv = await sessaoSimulada(id);
	if (!conv) return new NextResponse("Not Found", { status: 404 });

	const { value, comment, traceId } = parsed.data;
	const nota = value === "up" ? 1 : 0;

	// O registro: uma linha por avaliação. Sem catch — perder a nota em silêncio
	// era exatamente o defeito.
	await db.insert(sinaisDeConversa).values({
		conversationId: id,
		traceId: traceId ?? null,
		origem: ORIGEM,
		nome: NOME_DO_FEEDBACK,
		valor: nota,
		comentario: comment ?? null,
		criadoPor: session.user.email ?? session.user.id,
	});

	// O espelho em stdout (grepável/CloudWatch), com o turno carimbado — antes o
	// `traceId` mandado pela UI era DESCARTADO aqui.
	publicarScores(
		[
			{
				name: NOME_DO_FEEDBACK,
				value: nota,
				dataType: "BOOLEAN",
				...(comment ? { comment } : {}),
				sessionId: id,
				...(traceId ? { traceId } : {}),
			},
		],
		"feedback do simulador",
	);

	return NextResponse.json({ ok: true });
}

/** As avaliações da conversa, da mais recente para a mais antiga. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	const conv = await sessaoSimulada(id);
	if (!conv) return new NextResponse("Not Found", { status: 404 });

	const rows = await db
		.select({
			id: sinaisDeConversa.id,
			traceId: sinaisDeConversa.traceId,
			nome: sinaisDeConversa.nome,
			valor: sinaisDeConversa.valor,
			comentario: sinaisDeConversa.comentario,
			criadoPor: sinaisDeConversa.criadoPor,
			criadoEm: sinaisDeConversa.criadoEm,
		})
		.from(sinaisDeConversa)
		.where(eq(sinaisDeConversa.conversationId, id))
		.orderBy(desc(sinaisDeConversa.criadoEm));

	return NextResponse.json({ avaliacoes: rows });
}
