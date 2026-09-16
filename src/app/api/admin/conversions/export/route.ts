import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversionEvents, leads } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";

/**
 * Reconciliação Growth: uma linha por lead, sem e-mail/telefone/CPF ou texto de
 * conversa. Eventos e origem ficam lado a lado para comparar CRM × CAPI × Meta.
 */
export async function GET() {
	const { error } = await requireRole("admin", "viewer");
	if (error) return error;
	const rows = await db
		.select({
			leadId: leads.id,
			stage: leads.stage,
			isSimulated: leads.isSimulated,
			eventName: conversionEvents.eventName,
			eventId: conversionEvents.eventKey,
			eventTime: conversionEvents.occurredAt,
			status: conversionEvents.status,
			lastError: conversionEvents.lastError,
			campaignId: conversionEvents.campaignId,
			adsetId: conversionEvents.adsetId,
			adId: conversionEvents.adId,
			proposalId: conversionEvents.proposalId,
			saleId: conversionEvents.saleId,
			value: conversionEvents.value,
			currency: conversionEvents.currency,
		})
		.from(leads)
		.leftJoin(conversionEvents, eq(conversionEvents.leadId, leads.id))
		.where(
			inArray(conversionEvents.eventName, [
				"conversation_started",
				"lead",
				"qualified_lead",
				"offer_viewed",
				"proposal_sent",
				"purchase",
			]),
		)
		.orderBy(asc(leads.id), asc(conversionEvents.occurredAt));
	return Response.json({ generatedAt: new Date().toISOString(), leads: rows });
}
