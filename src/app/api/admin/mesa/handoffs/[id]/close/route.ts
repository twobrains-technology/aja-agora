import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mesaAttendants, mesaHandoffs } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isMesaExterna } from "@/lib/admin/role-scope";
import { closeMesaHandoff, getMesaAttendantByUserId } from "@/lib/mesa/handoff";
import { notifyMesaAttendant } from "@/lib/whatsapp/mesa/notify";

// Encerrar um atendimento de mesa: fecha o handoff (concluido) E move o lead pra `fechado_ganho`
// (decisão Kairo 2026-07-03 — raia provisória). Fecha o gap do handoff que nunca terminava.
// Ver docs/decisoes/2026-07-03-mesa-encerrar-atendimento-vai-pra-ganho.md.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	// A mesa externa ENCERRA o próprio atendimento — é o trabalho dela, e sem
	// isso o handoff ficava aberto pra sempre depois de ela marcar o caso como
	// ganho pelo card. Reatribuir continua sendo só do admin (é gestão de mesa).
	const { error, session, role } = await requireRole("admin", "mesa_externa");
	if (error) return error;

	const { id } = await params;

	if (isMesaExterna(role)) {
		const atendente = await getMesaAttendantByUserId(session.user.id);
		if (!atendente || !atendente.isActive) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}
		// Só encerra o que é dela — trocar o id na URL não fecha o caso do colega.
		const [meu] = await db
			.select({ id: mesaHandoffs.id })
			.from(mesaHandoffs)
			.where(and(eq(mesaHandoffs.id, id), eq(mesaHandoffs.mesaAttendantId, atendente.id)))
			.limit(1);
		if (!meu) {
			return Response.json(
				{ error: "Forbidden", reason: "handoff_de_outro_atendente" },
				{ status: 403 },
			);
		}
	}

	const result = await closeMesaHandoff(id, session?.user.id);
	if (!result.ok) {
		return Response.json(
			{ error: result.reason },
			{ status: result.reason === "handoff_not_found" ? 404 : 409 },
		);
	}

	// Best-effort: avisa o atendente responsável que o atendimento foi encerrado.
	try {
		if (result.attendantId) {
			const [att] = await db
				.select({ whatsapp: mesaAttendants.whatsapp })
				.from(mesaAttendants)
				.where(eq(mesaAttendants.id, result.attendantId))
				.limit(1);
			if (att) {
				await notifyMesaAttendant(
					att.whatsapp,
					`O atendimento de ${result.lead?.name ?? "o cliente"} foi encerrado.`,
				);
			}
		}
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "mesa-close-route",
				handoff_id: id,
				error: err instanceof Error ? err.message : String(err),
				note: "notificação de encerramento falhou (encerramento mantido)",
			}),
		);
	}

	return Response.json({ ok: true, handoff: result.handoff }, { status: 200 });
}
