import { expect, test } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { cleanupConversation, closeDb, createConversation, waitForLead } from "../../utils/db";

test.describe("EC-02 — Nomes com acentos, hífen, apóstrofo", () => {
	test.afterEach(async () => {
		await closeDb();
	});

	const testCases = [
		{ name: "José", expectedFirst: "José" },
		{ name: "Jean-Luc", expectedFirst: "Jean-Luc" },
		{ name: "D'Angelo", expectedFirst: "D'Angelo" },
		{ name: "Álvaro", expectedFirst: "Álvaro" },
		{ name: "Müller", expectedFirst: "Müller" },
	];

	for (const testCase of testCases) {
		test(`CA-20: Aceita nome "${testCase.name}"`, async ({ request }) => {
			const conversationId = uuidv4();

			// POST /api/leads exige uma conversation existente (senão 404) — cria
			// via helper antes de chamar o endpoint direto (sem passar pelo chat).
			await createConversation(conversationId);

			const resp = await request.post("/api/leads", {
				headers: { "Content-Type": "application/json" },
				data: {
					conversationId,
					name: testCase.name,
					phone: "11987654321",
					email: "",
				},
			});

			expect(resp.ok()).toBeTruthy();

			const lead = await waitForLead(conversationId);
			expect(lead.name).toBe(testCase.expectedFirst);

			await cleanupConversation(conversationId);
		});
	}
});
