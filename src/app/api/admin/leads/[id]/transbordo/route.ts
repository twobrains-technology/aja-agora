import { z } from "zod";
import { requireRole } from "@/lib/admin/require-role";
import { createMesaHandoff } from "@/lib/mesa/handoff";
import { broadcastCaseToAttendants } from "@/lib/whatsapp/mesa/outbound";

// Transbordo manual de um lead do kanban para a MESA (FIX-64 + FIX-124).
// Gatilho é o botão no card (DEC-B). O caso vai por BROADCAST a TODOS os atendentes de
// mesa (não single-select); o 1º que clica "Vou atender" assume (claim). Spec:
// docs/visao/mesa-de-operacao.md §4 + jornada-canonica.md (Parte 2, D15/D16).
const transbordoSchema = z.object({
	// Cota escolhida explícita (opcional) — quando omitida, resolve a proposta mais
	// recente do lead server-side. Sem `mesaAttendantId`: o broadcast decide o dono.
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

	// FIX-124/125: handoff nasce SEM dono (broadcast decide). createdBy = admin que clicou.
	const result = await createMesaHandoff({
		leadId: id,
		beviProposalId: parsed.data.beviProposalId ?? null,
		createdBy: session.user.id,
	});

	if (!result.ok) {
		if (result.reason === "lead_not_found") {
			return Response.json({ error: "Lead not found" }, { status: 404 });
		}
		if (result.reason === "attendant_not_found") {
			// Não ocorre neste caminho (sem mesaAttendantId no input) — guarda defensiva.
			return Response.json({ error: "attendant_not_found" }, { status: 500 });
		}
		// handoff_ativo_existe — idempotência: não cria segundo registro nem reenvia.
		return Response.json(
			{ error: "handoff_ativo_existe", handoffId: result.handoffId },
			{ status: 409 },
		);
	}

	// FIX-124: broadcast do dossiê a TODOS os atendentes de mesa com botão "Vou atender".
	// Best-effort — o handoff já está registrado (fonte de verdade); falha do canal externo
	// é reportada, não derruba o caso nem faz rollback.
	let outboundError: string | undefined;
	try {
		const { sent, failed } = await broadcastCaseToAttendants(result.handoff.id, {
			lead: result.lead,
			proposal: result.proposal,
		});
		if (sent === 0 && failed > 0) outboundError = "broadcast falhou para todos os atendentes";
		if (sent === 0 && failed === 0) outboundError = "nenhum atendente de mesa ativo";
	} catch (err) {
		outboundError = String(err);
	}

	return Response.json({ handoff: result.handoff, outboundError }, { status: 201 });
}
