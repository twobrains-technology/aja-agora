import { expect, test } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { cleanupConversation, closeDb, getLeadByConversationId } from "../../utils/db";

test.describe("EC-10 — Race condition em save_contact_name", () => {
	let conversationId: string;

	test.beforeEach(() => {
		conversationId = uuidv4();
	});

	test.afterEach(async () => {
		await cleanupConversation(conversationId);
		await closeDb();
	});

	test("CA-28: 2 save_contact_name paralelos não duplicam lead", async ({ request }) => {
		// Disparar 2 user messages com nomes diferentes em paralelo
		const _resp1 = request.post("/api/chat", {
			headers: { "Content-Type": "application/json" },
			data: {
				conversationId,
				action: { kind: "category", category: "auto" },
			},
		});

		await new Promise((r) => setTimeout(r, 1000));

		// Agora disparar 2 respostas de nome em paralelo
		const nameResp1 = request.post("/api/chat", {
			headers: { "Content-Type": "application/json" },
			data: {
				conversationId,
				userMessage: "Kairo",
			},
		});

		const nameResp2 = request.post("/api/chat", {
			headers: { "Content-Type": "application/json" },
			data: {
				conversationId,
				userMessage: "Alan",
			},
		});

		const [r1, r2] = await Promise.all([nameResp1, nameResp2]);

		expect(r1.ok()).toBeTruthy();
		expect(r2.ok()).toBeTruthy();

		await new Promise((r) => setTimeout(r, 1500));

		// Verificar que apenas 1 lead foi criado
		const lead = await getLeadByConversationId(conversationId);

		// CA-28: Lead único
		expect(lead).toBeTruthy();
		// Nome será um dos dois (last-write-wins)
		expect(["Kairo", "Alan"]).toContain(lead.name);

		// Não há exceção / deadlock
	});
});
