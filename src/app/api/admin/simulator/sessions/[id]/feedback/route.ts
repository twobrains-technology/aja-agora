/**
 * POST — feedback humano (👍/👎) de uma conversa do SIMULADOR → score
 * `user_feedback` (BOOLEAN 1/0), no TURNO quando a UI mandar `traceId` (data-part
 * `data-trace`), senão na session (= conversa).
 *
 * Onde isso mora hoje: sinal local em stdout (`publicarScores`), com o `traceId` do
 * turno carimbado na linha — antes ele era enviado pelo cliente e DESCARTADO aqui.
 * A persistência do score em tabela própria não existe (não há tabela de sinais em
 * `src/db/schema.ts`); a proposta está em `.orientacao/pendencia-ADMIN-ROTAS.md`.
 *
 * Leis: sinal fora do ar NUNCA vira 500 — responde `{ ok:true }` e a vida segue
 * (observabilidade não quebra o app). Dev-only: 404 em produção via `isSimulatorEnabled()`.
 */
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { publicarScores } from "@/lib/observability/sinais/publicar";
import { isSimulatorEnabled } from "@/lib/utils/env";

const bodySchema = z.object({
	value: z.enum(["up", "down"]),
	traceId: z.string().min(1).optional(),
	comment: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error } = await requireRole("admin");
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

	const conv = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, id), eq(conversations.isSimulated, true)),
	});
	if (!conv) return new NextResponse("Not Found", { status: 404 });

	const { value, comment, traceId } = parsed.data;
	// Feedback do operador sobre uma sessão SIMULADA: vira sinal local, com a
	// conversa como sessão e o turno (`traceId`) quando a UI mandar um. Sem SDK no
	// caminho — é linha estruturada.
	publicarScores(
		[
			{
				name: "user_feedback",
				value: value === "up" ? 1 : 0,
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
