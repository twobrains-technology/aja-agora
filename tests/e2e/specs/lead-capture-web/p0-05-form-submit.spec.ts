import { expect, test } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import {
	cleanupConversation,
	closeDb,
	createConversation,
	getLeadByConversationId,
	getLeadEvents,
} from "../../utils/db";

test.describe("P0-05 — Form Submit sem Email", () => {
	let conversationId: string;

	test.beforeEach(() => {
		conversationId = uuidv4();
	});

	test.afterEach(async () => {
		await cleanupConversation(conversationId);
		await closeDb();
	});

	test("CA-14, CA-15: Form submit com phone, sem email, promove stage", async ({ request }) => {
		// Setup: Criar conversation no DB
		await createConversation(conversationId);

		// POST /api/leads com email vazio
		const submitResp = await request.post("/api/leads", {
			headers: { "Content-Type": "application/json" },
			data: {
				conversationId,
				name: "Kairo",
				phone: "(11) 98765-4321",
				email: "", // Vazio
			},
		});

		// CA-14: Status 200
		expect(submitResp.ok()).toBeTruthy();

		const submitData = await submitResp.json();
		expect(submitData.ok).toBe(true);
		expect(submitData.leadId).toBeTruthy();

		await new Promise((r) => setTimeout(r, 1000));

		// Query DB
		const lead = await getLeadByConversationId(conversationId);

		// CA-14: Verificar campos salvos
		expect(lead.name).toBe("Kairo");
		expect(lead.phone).toBe("11987654321");
		expect(lead.email).toBeNull(); // Vazio → NULL

		// CA-15: Stage promovido para em_negociacao (handoff via agents)
		expect(lead.stage).toBe("em_negociacao");

		// Verificar lead_events — evento de transição para em_negociacao
		const events = await getLeadEvents(lead.id);
		const negotiationEvent = events.find((e) => e.to_stage === "em_negociacao");
		expect(negotiationEvent).toBeTruthy();
	});
});
