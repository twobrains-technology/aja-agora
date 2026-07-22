import { z } from "zod";
import { STAGE_ORDER, transitionLeadStage } from "@/lib/admin/lead-transitions";
import { requireRole } from "@/lib/admin/require-role";

const stageSchema = z.object({
	stage: z.enum(STAGE_ORDER),
	// FIX-44: regressão (mover pra raia anterior) exige flag explícita. Default
	// forward-only — o admin não regride em silêncio por arrasto acidental.
	allowRegression: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error, session } = await requireRole("admin", "attendant");
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
