import { expect, type Page, test } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import {
	cleanupConversation,
	closeDb,
	getConversation,
	getLeadByConversationId,
	getLeadEvents,
} from "../../utils/db";

test.describe("P0-01 — Captura de Nome", () => {
	let conversationId: string;
	let page: Page;

	test.beforeEach(async ({ page: testPage }) => {
		page = testPage;
		conversationId = uuidv4();
	});

	test.afterEach(async () => {
		await cleanupConversation(conversationId);
		await closeDb();
	});

	test("CA-01 to CA-04: save_contact_name dispara e cria lead", async () => {
		// Step 1: Visita página com conversationId
		await page.goto("/");

		// Step 2: POST /api/chat com action category=auto pra rotear pro specialist
		const categoryResponse = await page.request.post("/api/chat", {
			headers: {
				"Content-Type": "application/json",
			},
			data: {
				conversationId,
				action: {
					kind: "category",
					category: "auto",
				},
			},
		});

		if (!categoryResponse.ok()) {
			const body = await categoryResponse.text();
			console.error(
				`[P0-01] Category POST failed: ${categoryResponse.status()}\n${body.substring(0, 500)}`,
			);
		}
		expect(categoryResponse.ok()).toBeTruthy();

		// Wait a bit para especialista responder
		await page.waitForTimeout(2000);

		// Step 3: POST com user message "Kairo"
		const nameResponse = await page.request.post("/api/chat", {
			headers: {
				"Content-Type": "application/json",
			},
			data: {
				conversationId,
				messages: [{ role: "user", content: "Kairo" }],
			},
		});

		if (!nameResponse.ok()) {
			const body = await nameResponse.text();
			console.error(
				`[P0-01] Name POST failed: ${nameResponse.status()}\n${body.substring(0, 500)}`,
			);
		}
		expect(nameResponse.ok()).toBeTruthy();

		// Step 4: Parse streaming response pra validar tool call
		const responseText = await nameResponse.text();
		const lines = responseText.split("\n").filter((l) => l.trim());

		let foundSaveContactNameToolCall = false;
		let _toolCallName = "";

		for (const line of lines) {
			if (line.startsWith("data: ")) {
				try {
					const json = JSON.parse(line.substring(6));
					if (json.type === "tool-call" && json.toolName === "save_contact_name") {
						foundSaveContactNameToolCall = true;
						_toolCallName = json.args?.name || "";
						// CA-01: Verificar que tool call contém nome
						expect(json.args.name).toBe("Kairo");
					}
				} catch (_e) {
					// Ignorar linhas que não são JSON válido
				}
			}
		}

		// CA-01: Verificar que tool call foi disparada
		expect(foundSaveContactNameToolCall).toBeTruthy();

		// Step 5: Query DB — verificar lead criada
		await page.waitForTimeout(1000); // Aguardar persistência
		const lead = await getLeadByConversationId(conversationId);

		// CA-02: Verificar name e stage
		expect(lead).toBeTruthy();
		expect(lead.name).toBe("Kairo");
		expect(lead.stage).toBe("novo");
		expect(lead.phone).toBeNull();

		// Step 6: Query conversations
		const conv = await getConversation(conversationId);

		// CA-03: Verificar contactName
		expect(conv.contact_name).toBe("Kairo");

		// Step 7: Query lead_events
		const events = await getLeadEvents(lead.id);

		// CA-04: Verificar evento de stage
		expect(events.length).toBeGreaterThanOrEqual(1);
		const novoEvent = events.find((e) => e.to_stage === "novo");
		expect(novoEvent).toBeTruthy();
		expect(novoEvent.from_stage).toBeNull();
	});
});
