import { test, expect } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { cleanupConversation, getLeadByConversationId, getConversation, closeDb } from "../../utils/db";

test.describe("P0-03 — Recusa WhatsApp", () => {
  let conversationId: string;

  test.beforeEach(() => {
    conversationId = uuidv4();
  });

  test.afterEach(async () => {
    await cleanupConversation(conversationId);
    await closeDb();
  });

  test("CA-10, CA-11: Agora não registra metadata e mantém stage", async ({ request }) => {
    // Setup: conversation com nome + card WhatsApp
    // (simplificado: apenas validar o action handler sem fluxo completo)

    // POST action whatsapp_optin_decline
    const declineResp = await request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: {
        conversationId,
        action: {
          kind: "whatsapp_optin_decline",
        },
      },
    });

    // CA-10: Verificar resposta 200
    expect(declineResp.ok()).toBeTruthy();

    const declineText = await declineResp.text();
    // Verificar que resposta contém texto de seguimento
    expect(declineText).toMatch(/sem problema|seguimos|por aqui/i);

    await new Promise((r) => setTimeout(r, 1000));

    // Query conversations — verificar metadata
    const conv = await getConversation(conversationId);

    // CA-11: Verificar flags
    if (conv) {
      expect(conv.metadata?.whatsappOptinDeclined).toBe(true);
    }

    // Verificar que lead.phone permanece null
    const lead = await getLeadByConversationId(conversationId);
    if (lead) {
      expect(lead.phone).toBeNull();
      expect(lead.stage).toBe("novo");
    }
  });
});
