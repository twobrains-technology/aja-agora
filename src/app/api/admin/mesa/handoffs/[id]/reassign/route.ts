import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { beviProposals, mesaAttendants } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { reassignMesaHandoff } from "@/lib/mesa/handoff";
import { notifyMesaAttendant } from "@/lib/whatsapp/mesa/notify";
import { sendCaseToAttendant, toDossier } from "@/lib/whatsapp/mesa/outbound";

// Reatribuir um caso já assumido a OUTRO atendente de mesa (decisão Kairo 2026-07-03: reatribuir a um
// específico, não re-broadcast). Ver docs/design/specs/2026-07-03-mesa-visibilidade-reatribuicao-design.md.
const reassignSchema = z.object({ mesaAttendantId: z.string().uuid() });

const REASSIGN_ERROR_STATUS: Record<string, number> = {
	handoff_not_found: 404,
	attendant_not_found: 404,
	handoff_encerrado: 409,
	mesmo_atendente: 400,
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error, session } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	const parsed = reassignSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid body", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const result = await reassignMesaHandoff(id, parsed.data.mesaAttendantId, session?.user.id);
	if (!result.ok) {
		return Response.json(
			{ error: result.reason },
			{ status: REASSIGN_ERROR_STATUS[result.reason] ?? 400 },
		);
	}

	// Notificações (best-effort — o estado já mudou, é a fonte de verdade): o antigo dono é liberado
	// e o novo recebe o dossiê do caso pra assumir o atendimento.
	const clienteNome = result.lead?.name ?? "o cliente";
	try {
		if (result.oldAttendantId) {
			const [old] = await db
				.select({ whatsapp: mesaAttendants.whatsapp })
				.from(mesaAttendants)
				.where(eq(mesaAttendants.id, result.oldAttendantId))
				.limit(1);
			if (old) {
				await notifyMesaAttendant(
					old.whatsapp,
					`O caso de ${clienteNome} foi reatribuído — você não é mais o responsável.`,
				);
			}
		}
		const proposal = result.handoff.beviProposalId
			? ((
					await db
						.select()
						.from(beviProposals)
						.where(eq(beviProposals.id, result.handoff.beviProposalId))
						.limit(1)
				)[0] ?? null)
			: null;
		await sendCaseToAttendant(
			toDossier({
				attendant: { nome: result.newAttendant.nome, whatsapp: result.newAttendant.whatsapp },
				lead: { name: result.lead?.name ?? null, phone: result.lead?.phone ?? null },
				proposal: proposal
					? {
							segmento: proposal.segmento,
							administradora: proposal.administradora,
							grupo: proposal.grupo,
							creditValue: proposal.creditValue,
							monthlyPayment: proposal.monthlyPayment,
							termMonths: proposal.termMonths,
							consortiumProposalLink: proposal.consortiumProposalLink,
						}
					: null,
			}),
		);
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "mesa-reassign-route",
				handoff_id: id,
				error: err instanceof Error ? err.message : String(err),
				note: "notificação de reatribuição falhou (reatribuição mantida)",
			}),
		);
	}

	return Response.json({ ok: true, handoff: result.handoff }, { status: 200 });
}
