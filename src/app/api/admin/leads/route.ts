import { desc } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { dedupLeadsByContact } from "@/lib/admin/kanban-dedup";
import { type LeadStage, STAGE_ORDER } from "@/lib/admin/lead-transitions";
import { requireRole } from "@/lib/admin/require-role";
import { getActiveHandoffsByLead } from "@/lib/mesa/handoff";

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

	// FIX-45: dedup por CONTATO — o mesmo cliente em web + WhatsApp vira UM card
	// (não dois). Leads anônimos (sem contactId) ficam individuais. Cada card
	// carrega `channels` (badge multi-canal) e `contactId` (abre a visão
	// consolidada). Lógica pura em @/lib/admin/kanban-dedup.
	const cards = dedupLeadsByContact(
		allLeads.map((l) => ({ ...l, updatedAt: l.updatedAt.toISOString() })),
	);

	// Visibilidade (spec 2026-07-03): anexa o responsável da mesa (handoff ativo) a cada card,
	// pro selo do kanban e o bloco "Responsável". card.id = lead representativo do contato.
	const handoffs = await getActiveHandoffsByLead(cards.map((c) => c.id));
	const cardsWithHandoff = cards.map((c) => ({
		...c,
		activeHandoff: handoffs.get(c.id) ?? null,
	}));

	// Agrupa os cards por raia.
	const groupedLeads: Record<string, typeof cardsWithHandoff> = {};
	for (const stage of STAGE_ORDER) {
		groupedLeads[stage] = [];
	}
	for (const card of cardsWithHandoff) {
		const stage = card.stage as LeadStage;
		if (groupedLeads[stage]) {
			groupedLeads[stage].push(card);
		}
	}

	return Response.json({ leads: groupedLeads, stages: STAGE_ORDER });
}
