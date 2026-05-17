import { test, expect } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { cleanupConversation, getConversation, closeDb } from "../../utils/db";

test.describe("EC-07 — Guard de dupla apresentação do card WhatsApp", () => {
  let conversationId: string;

  test.beforeEach(() => {
    conversationId = uuidv4();
  });

  test.afterEach(async () => {
    await cleanupConversation(conversationId);
    await closeDb();
  });

  test("CA-25: tool present_whatsapp_optin não emite artifact 2x", async ({ request }) => {
    // Setup: Conversation com metadata.whatsappOptinShown = true

    // POST action whatsapp_optin (primeira vez)
    const resp1 = await request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        conversationId,
        action: { kind: "whatsapp_optin", phone: "11987654321" },
      },
    });

    expect(resp1.ok()).toBeTruthy();
    await new Promise((r) => setTimeout(r, 1000));

    // Verificar que whatsappOptinShown=true
    let conv = await getConversation(conversationId);
    expect(conv?.metadata?.whatsappOptinShown).toBe(true);

    // Tentar apresentar card de novo (forçar via action ou user message)
    // Idealmente, a tool não emiteria artifact novamente
    const resp2 = await request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        conversationId,
        userMessage: "pode me oferecer whatsapp de novo?",
      },
    });

    expect(resp2.ok()).toBeTruthy();

    const text2 = await resp2.text();

    // CA-25: Verificar que whatsapp_optin artifact NÃO aparece
    const hasWhatsappOptinAgain = text2.includes('"toolName":"present_whatsapp_optin"') || text2.includes("whatsapp_optin");

    if (hasWhatsappOptinAgain) {
      console.warn("CA-25 FALHA: whatsapp_optin foi emitido novamente");
      expect(hasWhatsappOptinAgain).toBe(false);
    }
  });
});
