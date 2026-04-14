import { db } from "@/db";
import { leads } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { STAGE_ORDER, type LeadStage } from "@/lib/admin/lead-transitions";
import { desc } from "drizzle-orm";

export async function GET() {
  const { error } = await requireRole("admin", "viewer");
  if (error) return error;

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
