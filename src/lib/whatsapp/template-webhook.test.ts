/**
 * Webhook template_status_update — TDD do parser de payload.
 * Cobre CA-P0-05 (sync via webhook) e PF-03 (ordem de eventos).
 *
 * O parser é puro — só extrai status e timestamp do payload.
 * O update do DB é integration test (precisa de DB up).
 */
import { describe, expect, it } from "vitest";
import { parseTemplateStatusPayload } from "./template-webhook";

describe("parseTemplateStatusPayload", () => {
	it("parseia payload APPROVED válido", () => {
		const payload = {
			event: "APPROVED",
			message_template_id: 123,
			message_template_name: "boas_vindas",
			message_template_language: "pt_BR",
			reason: null,
		};
		const result = parseTemplateStatusPayload(payload);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.name).toBe("boas_vindas");
			expect(result.data.status).toBe("APPROVED");
			expect(result.data.metaTemplateId).toBe("123");
		}
	});

	it("parseia REJECTED com reason", () => {
		const payload = {
			event: "REJECTED",
			message_template_id: 456,
			message_template_name: "oferta_promo",
			message_template_language: "pt_BR",
			reason: "INVALID_FORMAT",
		};
		const result = parseTemplateStatusPayload(payload);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.status).toBe("REJECTED");
			expect(result.data.rejectionReason).toBe("INVALID_FORMAT");
		}
	});

	it("aceita aliases (FLAGGED → PAUSED como Meta envia)", () => {
		const payload = {
			event: "FLAGGED",
			message_template_id: 789,
			message_template_name: "spam_template",
			message_template_language: "pt_BR",
		};
		const result = parseTemplateStatusPayload(payload);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data.status).toBe("PAUSED");
	});

	it("rejeita payload sem event", () => {
		const result = parseTemplateStatusPayload({
			message_template_name: "x",
		});
		expect(result.ok).toBe(false);
	});

	it("rejeita event desconhecido", () => {
		const result = parseTemplateStatusPayload({
			event: "UFO_LANDED",
			message_template_name: "x",
		});
		expect(result.ok).toBe(false);
	});

	it("rejeita sem name", () => {
		const result = parseTemplateStatusPayload({ event: "APPROVED" });
		expect(result.ok).toBe(false);
	});
});
