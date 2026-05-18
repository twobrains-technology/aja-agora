import { test, expect } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { cleanupConversation, closeDb, createConversation } from "../../utils/db";

test.describe("P0-04 — Form Fallback Pré-preenchido", () => {
  let conversationId: string;

  test.beforeEach(() => {
    conversationId = uuidv4();
  });

  test.afterEach(async () => {
    await cleanupConversation(conversationId);
    await closeDb();
  });

  test("CA-12, CA-13: GET /api/leads retorna dados pré-preenchidos", async ({ request }) => {
    // Setup: Lead com name e phone já salvos
    // (simplificado: apenas testar o endpoint GET)

    // Criar conversation no DB
    await createConversation(conversationId);

    // POST /api/leads com dados (simular captura anterior)
    const createResp = await request.post("/api/leads", {
      headers: { "Content-Type": "application/json" },
      data: {
        conversationId,
        name: "Kairo",
        phone: "(11) 98765-4321", // Com formatação
        email: "",
      },
    });

    expect(createResp.ok()).toBeTruthy();
    await new Promise((r) => setTimeout(r, 500));

    // GET /api/leads/<conversationId>
    const getResp = await request.get(`/api/leads/${conversationId}`);

    // CA-12: Status 200, schema correto
    expect(getResp.ok()).toBeTruthy();

    const data = await getResp.json();
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("phone");
    expect(data).toHaveProperty("email");

    // CA-13: Valores corretos (phone normalizado)
    expect(data.name).toBe("Kairo");
    expect(data.phone).toBe("11987654321"); // Normalizado
    expect(data.email).toBe(""); // String vazia
  });
});
