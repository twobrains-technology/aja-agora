import { test, expect } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { cleanupConversation, getLeadByConversationId, closeDb } from "../../utils/db";

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

      // POST /api/chat com tool call save_contact_name (simulado direto no API)
      // Ou chamar o endpoint diretamente
      // Para este teste, usamos uma abordagem simplificada

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

      await new Promise((r) => setTimeout(r, 500));

      const lead = await getLeadByConversationId(conversationId);
      expect(lead.name).toBe(testCase.expectedFirst);

      await cleanupConversation(conversationId);
    });
  }
});
