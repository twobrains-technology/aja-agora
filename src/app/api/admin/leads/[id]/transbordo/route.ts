import { z } from "zod";
import { requireRole } from "@/lib/admin/require-role";
import { createMesaHandoff } from "@/lib/mesa/handoff";

// Transbordo manual de um lead do kanban para um atendente de mesa (FIX-64).
// Gatilho é o botão no card (DEC-B). Spec: docs/visao/mesa-de-operacao.md §4.
const transbordoSchema = z.object({
	mesaAttendantId: z.string().uuid(),
	// Cota escolhida explícita (opcional) — quando omitida, resolve a proposta mais
	// recente do lead server-side.
	beviProposalId: z.string().uuid().optional(),
});

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

	const parsed = transbordoSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid body", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const result = await createMesaHandoff({
		leadId: id,
		mesaAttendantId: parsed.data.mesaAttendantId,
		beviProposalId: parsed.data.beviProposalId ?? null,
		createdBy: session!.user.id,
	});

	if (!result.ok) {
		if (result.reason === "lead_not_found") {
			return Response.json({ error: "Lead not found" }, { status: 404 });
		}
		if (result.reason === "attendant_not_found") {
			return Response.json(
				{ error: "Atendente de mesa não encontrado ou inativo" },
				{ status: 404 },
			);
		}
		// handoff_ativo_existe — idempotência: não cria segundo registro nem reenvia.
		return Response.json(
			{ error: "handoff_ativo_existe", handoffId: result.handoffId },
			{ status: 409 },
		);
	}

	// FIX-65 acopla aqui o outbound do dossiê (sendCaseToAttendant) — best-effort,
	// sem rollback do registro.
	return Response.json({ handoff: result.handoff }, { status: 201 });
}
