import { describe, expect, it } from "vitest";
import { montarPayload } from "./meta-capi";

const cfg = {
	enabled: true,
	pixelId: "1360432072874656",
	accessToken: "test",
	apiVersion: "v21.0",
	testEventCode: "TESTE",
};

describe("CAPI V2", () => {
	it("usa os nomes Meta exigidos, event_id estável e dados sem PII crua", () => {
		const payload = montarPayload(
			[
				{
					id: "1",
					eventName: "qualified_lead",
					eventKey: "lead:abc:qualified_lead",
					occurredAt: new Date("2026-09-15T12:00:00Z"),
					value: null,
					currency: "BRL",
					hashedEmail: "a".repeat(64),
					hashedPhone: "b".repeat(64),
					externalId: "c".repeat(64),
					fbc: "fb.1.1.click",
					fbp: "fb.1.1.browser",
					ctwaClid: null,
					actionSource: "website",
					campaignId: "100",
					adsetId: "200",
					adId: "300",
					previousStage: "engajado",
					currentStage: "qualificado",
				},
			],
			cfg,
		);
		const event = payload.data[0];
		expect(event).toMatchObject({
			event_name: "QualifiedLead",
			event_id: "lead:abc:qualified_lead",
			event_time: 1789473600,
			action_source: "website",
		});
		expect(event.user_data).toEqual({
			em: ["a".repeat(64)],
			ph: ["b".repeat(64)],
			external_id: ["c".repeat(64)],
			fbc: "fb.1.1.click",
			fbp: "fb.1.1.browser",
		});
		expect(event.custom_data).toMatchObject({
			currency: "BRL",
			campaign_id: "100",
			adset_id: "200",
			ad_id: "300",
			previous_stage: "engajado",
			current_stage: "qualificado",
		});
		expect(JSON.stringify(payload)).not.toContain("@example.com");
	});

	it("preserva WhatsApp como business_messaging e Purchase com valor em BRL", () => {
		const [event] = montarPayload(
			[
				{
					id: "2",
					eventName: "purchase",
					eventKey: "lead:x:purchase:sale",
					occurredAt: new Date(),
					value: "150000.00",
					currency: "BRL",
					hashedEmail: null,
					hashedPhone: null,
					fbc: null,
					fbp: null,
					ctwaClid: "ctwa",
					actionSource: "business_messaging",
					saleId: "sale",
				},
			],
			cfg,
		).data;
		expect(event).toMatchObject({ event_name: "Purchase", messaging_channel: "whatsapp" });
		expect(event.custom_data).toMatchObject({ value: 150000, currency: "BRL", sale_id: "sale" });
	});
});
