import { z } from "zod";
import { requireRole } from "@/lib/admin/require-role";
import { createMesaHandoff } from "@/lib/mesa/handoff";
import { sendCaseToAttendant, toDossier } from "@/lib/whatsapp/mesa/outbound";

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

	// FIX-65: outbound do dossiê pro WhatsApp do atendente. Best-effort — o handoff já
	// está registrado (fonte de verdade); falha do canal externo é reportada, não
	// derruba o caso nem faz rollback.
	let outboundError: string | undefined;
	try {
		// FIX-125: attendant pode ser null (handoff sem dono). Nesta rota manual o dono
		// é sempre passado, mas o guard mantém o tipo honesto até o FIX-124 reescrever a
		// rota pro broadcast (que não pré-atribui atendente).
		if (result.attendant) {
			const dossier = toDossier({
				attendant: result.attendant,
				lead: result.lead,
				proposal: result.proposal,
			});
			const sent = await sendCaseToAttendant(dossier);
			if ("error" in sent && sent.error) outboundError = sent.error;
		}
	} catch (err) {
		outboundError = String(err);
	}

	return Response.json({ handoff: result.handoff, outboundError }, { status: 201 });
}
