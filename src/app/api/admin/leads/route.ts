import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { type LeadStage, STAGE_ORDER } from "@/lib/admin/lead-transitions";
import { requireRole } from "@/lib/admin/require-role";

export async function GET() {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const allLeads = await db.query.leads.findMany({
		where: eq(leads.isSimulated, false),
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
