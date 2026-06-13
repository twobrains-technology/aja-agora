import { desc } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { type LeadStage, STAGE_ORDER } from "@/lib/admin/lead-transitions";
import { requireRole } from "@/lib/admin/require-role";

export async function GET() {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	// Pipeline mostra TODOS os leads (incl. simulados) — o simulador é
	// considerado "demo path" pro stakeholder e deve refletir o fluxo real.
	// Dashboard de métricas comerciais (dashboard-queries.ts) continua
	// filtrando is_simulated=false — esse é caso separado.
	const allLeads = await db.query.leads.findMany({
		orderBy: [desc(leads.updatedAt)],
		with: {
			conversation: {
				columns: {
					channel: true,
					createdAt: true,
					updatedAt: true,
				},
			},
		},
	});

	// Group leads by stage
	const groupedLeads: Record<string, typeof allLeads> = {};
	for (const stage of STAGE_ORDER) {
		groupedLeads[stage] = [];
	}
	for (const lead of allLeads) {
		const stage = lead.stage as LeadStage;
		if (groupedLeads[stage]) {
			groupedLeads[stage].push(lead);
		}
	}

	return Response.json({ leads: groupedLeads, stages: STAGE_ORDER });
}
