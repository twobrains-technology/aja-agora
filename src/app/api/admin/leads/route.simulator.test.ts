/**
 * Teste de regressão: lead originado em conversa do SIMULADOR deve aparecer
 * na pipeline admin (GET /api/admin/leads).
 *
 * Bug reportado: conversas iniciadas via /admin/simulator (admin time-travel)
 * capturam contato (nome + WhatsApp) via o MESMO fluxo de prod
 * (saveContactName / saveContactWhatsapp), mas o lead criado nunca aparece
 * no kanban da pipeline. Investigação aponta que o lead é gravado com
 * `is_simulated = true` (herdado da conversation) e o handler GET filtra
 * com `eq(leads.isSimulated, false)`, escondendo o lead da pipeline.
 *
 * Contrato afirmado pelo teste:
 *   - Quando o simulador inicia uma conversa (POST /api/admin/simulator/sessions)
 *     e captura contato no mesmo caminho usado por prod (saveContactName +
 *     saveContactWhatsapp), o lead resultante DEVE constar na resposta de
 *     GET /api/admin/leads, agrupado pelo estágio correto.
 *
 * Integration test: bate no DB real do container (aja-pg-develop, 5434).
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leadEvents, leads } from "@/db/schema";
import { saveContactName, saveContactWhatsapp } from "@/lib/leads/contact-capture";

// requireRole consulta better-auth via headers() -- mockamos pra rodar a rota
// como admin sem subir todo o ciclo de cookie/sessão.
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi
		.fn()
		.mockResolvedValue({ error: null, session: { user: { id: "test-admin", role: "admin" } } }),
}));

const { GET } = await import("./route");

async function createSimulatedConversation(): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({
			channel: "web",
			isSimulated: true,
			metadata: { createdBySimUserId: "test-admin" },
		})
		.returning();
	return c.id;
}

async function cleanupConversation(convId: string): Promise<void> {
	// leadEvents cascade ao deletar leads; leads cascade ao deletar conversation.
	const leadRows = await db.query.leads.findMany({
		where: eq(leads.conversationId, convId),
	});
	for (const l of leadRows) {
		await db.delete(leadEvents).where(eq(leadEvents.leadId, l.id));
	}
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

type LeadsResponse = {
	leads: Record<string, Array<{ id: string; name: string | null; phone: string | null }>>;
	stages: string[];
};

describe("GET /api/admin/leads -- lead do simulador na pipeline", () => {
	let simConvId: string;

	beforeEach(async () => {
		simConvId = await createSimulatedConversation();
	});

	afterEach(async () => {
		await cleanupConversation(simConvId);
	});

	it("lead capturado em conversa simulada DEVE aparecer na resposta da pipeline", async () => {
		// Fluxo idêntico ao usado por prod: o agent chama save_contact_name e
		// o usuário envia phone via card whatsapp_optin. Em ambos os caminhos a
		// implementação real do simulador entra por essas mesmas funções.
		const nameResult = await saveContactName(simConvId, "Kairo");
		expect(nameResult.ok).toBe(true);

		const phoneResult = await saveContactWhatsapp(simConvId, "(11) 98765-4321");
		expect(phoneResult.ok).toBe(true);

		// Sanity: lead foi de fato persistido no DB com phone correto.
		const persistedLead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, simConvId),
		});
		expect(persistedLead).toBeDefined();
		expect(persistedLead?.phone).toBe("11987654321");
		expect(persistedLead?.name).toBe("Kairo");
		const leadId = persistedLead?.id as string;

		// Agora bate na rota da pipeline e exige que o lead esteja lá.
		const res = await GET();
		expect(res.status).toBe(200);
		const body = (await res.json()) as LeadsResponse;

		// Achata todos os leads de todas as colunas pra checar presença.
		const allReturned = Object.values(body.leads).flat();
		const found = allReturned.find((l) => l.id === leadId);

		expect(found, "lead do simulador NÃO apareceu na pipeline admin").toBeDefined();
		expect(found?.name).toBe("Kairo");
		expect(found?.phone).toBe("11987654321");
	});
});
