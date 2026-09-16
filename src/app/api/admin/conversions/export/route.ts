import { aliasedTable, and, asc, eq, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { conversionEvents, leads, visits } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";

/**
 * Reconciliação Growth: uma linha por lead, sem e-mail/telefone/CPF ou texto de
 * conversa. Eventos e origem ficam lado a lado para comparar CRM × CAPI × Meta.
 */
function csvCell(value: unknown): string {
	const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
	const { error } = await requireRole("admin", "viewer");
	if (error) return error;
	const firstVisit = aliasedTable(visits, "first_export_visit");
	const lastVisit = aliasedTable(visits, "last_export_visit");
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
			actionSource: conversionEvents.actionSource,
			externalId: conversionEvents.externalId,
			firstVisitId: conversionEvents.firstVisitId,
			lastVisitId: conversionEvents.lastVisitId,
			fbc: conversionEvents.fbc,
			fbp: conversionEvents.fbp,
			ctwaClid: conversionEvents.ctwaClid,
			clientUserAgent: conversionEvents.clientUserAgent,
			firstUtmSource: firstVisit.utmSource,
			firstUtmMedium: firstVisit.utmMedium,
			firstUtmCampaign: firstVisit.utmCampaign,
			firstUtmContent: firstVisit.utmContent,
			firstUtmTerm: firstVisit.utmTerm,
			firstFbclid: firstVisit.fbclid,
			firstCampaignId: firstVisit.campaignId,
			firstAdsetId: firstVisit.adsetId,
			firstAdId: firstVisit.adId,
			lastUtmSource: lastVisit.utmSource,
			lastUtmMedium: lastVisit.utmMedium,
			lastUtmCampaign: lastVisit.utmCampaign,
			lastUtmContent: lastVisit.utmContent,
			lastUtmTerm: lastVisit.utmTerm,
			lastFbclid: lastVisit.fbclid,
		})
		.from(leads)
		.leftJoin(
			conversionEvents,
			and(
				eq(conversionEvents.leadId, leads.id),
				inArray(conversionEvents.eventName, [
					"conversation_started",
					"lead",
					"qualified_lead",
					"offer_viewed",
					"proposal_sent",
					"purchase",
				]),
			),
		)
		.leftJoin(firstVisit, eq(firstVisit.id, conversionEvents.firstVisitId))
		.leftJoin(lastVisit, eq(lastVisit.id, conversionEvents.lastVisitId))
		.orderBy(asc(leads.id), asc(conversionEvents.occurredAt));
	const format = new URL(request.url).searchParams.get("format");
	if (format === "csv") {
		const headers = Object.keys(rows[0] ?? { leadId: null, eventName: null });
		const csv = [
			headers.join(","),
			...rows.map((row) =>
				headers.map((key) => csvCell(row[key as keyof (typeof rows)[number]])).join(","),
			),
		].join("\n");
		return new Response(`\ufeff${csv}\n`, {
			headers: {
				"Content-Type": "text/csv; charset=utf-8",
				"Content-Disposition": 'attachment; filename="aja-meta-capi-leads.csv"',
			},
		});
	}
	if (format === "xlsx") {
		const workbook = XLSX.utils.book_new();
		const worksheet = XLSX.utils.json_to_sheet(rows);
		XLSX.utils.book_append_sheet(workbook, worksheet, "Meta CAPI");
		const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
		return new Response(bytes, {
			headers: {
				"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"Content-Disposition": 'attachment; filename="aja-meta-capi-leads.xlsx"',
			},
		});
	}
	return Response.json({ generatedAt: new Date().toISOString(), leads: rows });
}
