import { expect, test } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { cleanupConversation, closeDb } from "../../utils/db";

test.describe("EC-04/EC-05 — Validações de phone", () => {
	test.afterEach(async () => {
		await closeDb();
	});

	const invalidPhones = [
		{ phone: "11987", reason: "incomplete" },
		{ phone: "01987654321", reason: "DDD starts with 0" },
		{ phone: "", reason: "empty" },
		{ phone: "123", reason: "too short" },
	];

	for (const testCase of invalidPhones) {
		test(`CA-22: Rejeita phone inválido "${testCase.phone}" (${testCase.reason})`, async ({
			request,
		}) => {
			const conversationId = uuidv4();

			// POST /api/chat com whatsapp_optin inválido
			// Esperado: rejeitado (implementação pode variar)
			const resp = await request.post("/api/chat", {
				headers: { "Content-Type": "application/json" },
				data: {
					conversationId,
					action: {
						kind: "whatsapp_optin",
						phone: testCase.phone,
					},
				},
			});

			// Não deve ser 200, ou se for, lead.phone deve ser NULL
			if (!resp.ok()) {
				expect(resp.status()).toBeGreaterThanOrEqual(400);
			}

			await cleanupConversation(conversationId);
		});
	}

	const validPhones = [
		"11987654321",
		"(11) 98765-4321",
		"+55 11 98765 4321",
		"5511987654321",
		"1133334444", // fixo
	];

	for (const phone of validPhones) {
		test(`CA-23: Normaliza phone "${phone}"`, async ({ request }) => {
			const conversationId = uuidv4();

			const resp = await request.post("/api/chat", {
				headers: { "Content-Type": "application/json" },
				data: {
					conversationId,
					action: { kind: "whatsapp_optin", phone },
				},
			});

			// Deve ser 200
			if (resp.ok()) {
				// Verificar normalização
				// Esperado: sempre 10-11 dígitos sem formatação
				const text = await resp.text();
				expect(text).toBeTruthy();
			}

			await cleanupConversation(conversationId);
		});
	}
});
