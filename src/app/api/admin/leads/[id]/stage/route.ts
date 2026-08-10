import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { STAGE_ORDER, transitionLeadStage } from "@/lib/admin/lead-transitions";
import { requireRole } from "@/lib/admin/require-role";
import { isMesaExterna, podeMoverCard } from "@/lib/admin/role-scope";
import { getLeadIdsDoAtendente, getMesaAttendantByUserId } from "@/lib/mesa/handoff";

const stageSchema = z.object({
	stage: z.enum(STAGE_ORDER),
	// FIX-44: regressão (mover pra raia anterior) exige flag explícita. Default
	// forward-only — o admin não regride em silêncio por arrasto acidental.
	allowRegression: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error, session, role } = await requireRole("admin", "attendant", "mesa_externa");
	if (error) return error;

	const { id } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = stageSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid stage", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	// A MESA EXTERNA só mexe no que é dela, e só pra frente dentro do próprio
	// escopo. Checado contra a raia REAL do banco — não contra a que o cliente
	// afirma ser a origem, que é informação sob controle de quem chama.
	if (isMesaExterna(role)) {
		const [lead] = await db
			.select({ stage: leads.stage })
			.from(leads)
			.where(eq(leads.id, id))
			.limit(1);
		if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

		const atendente = await getMesaAttendantByUserId(session.user.id);
		if (!atendente || !atendente.isActive) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}

		const meus = await getLeadIdsDoAtendente(atendente.id);
		if (!meus.includes(id)) {
			return Response.json(
				{ error: "Forbidden", reason: "lead_de_outro_atendente" },
				{ status: 403 },
			);
		}

		if (!podeMoverCard(role, lead.stage, parsed.data.stage)) {
			return Response.json(
				{ error: "Forbidden", reason: "movimento_fora_do_escopo", current: lead.stage },
				{ status: 403 },
			);
		}
	}

	const result = await transitionLeadStage(
		id,
		parsed.data.stage,
		{ type: "admin", id: session.user.id },
		{ allowRegression: parsed.data.allowRegression ?? false },
	);

	if (!result) {
		return Response.json({ error: "Lead not found" }, { status: 404 });
	}

	// Regressão pedida sem a flag → no-op silencioso vira sinal explícito pro UI.
	if (result.stage !== parsed.data.stage) {
		return Response.json(
			{ error: "Regression blocked", reason: "forward_only", current: result.stage },
			{ status: 409 },
		);
	}

	return Response.json(result);
}
