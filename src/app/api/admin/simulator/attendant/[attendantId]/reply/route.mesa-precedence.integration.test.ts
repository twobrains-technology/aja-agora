// QA autônomo Frente 3 (2026-07-01) — FIX-172: a rota do Simulador de Atendente
// (dev-only) chamava `handleAgentMessage` (proxy do chat de VENDAS) DIRETO, sem
// checar a precedência de canal que o webhook real aplica em processor.ts
// (isMesaAttendantPhone → handleMesaCopilot ANTES de handleAgentMessage). Efeito:
// um atendente de MESA testado pelo simulador nunca falava com o copiloto — caía
// sempre no fluxo de vendas, e o comentário da rota ("routing through the same
// handleAgentMessage as the webhook in processor.ts") era falso. Isso também
// bloqueava qualquer E2E de TELA real do copiloto da mesa (regra QA 2026-07-01,
// jornada §Copiloto da mesa) — o simulador era o único painel disponível e não
// respeitava a precedência.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sendTextMessage = vi.fn(async (..._args: unknown[]) => ({ messageId: "sim-1" }));
const generateMesaCopilotReply = vi.fn(async (..._args: unknown[]) => "orientação do copiloto (mock)");

vi.mock("@/lib/whatsapp/api", () => ({
	sendTextMessage: (...a: unknown[]) => sendTextMessage(...a),
	sendReplyButtons: vi.fn(async () => ({ messageId: "sim-1" })),
}));
vi.mock("@/lib/agent/mesa-copilot", () => ({
	generateMesaCopilotReply: (...a: unknown[]) => generateMesaCopilotReply(...a),
}));
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({ error: null, session: { user: { id: "test-admin" } } })),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function replyReq(text: string) {
	return new Request("http://test/api/admin/simulator/attendant/x/reply", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ text }),
	});
}

describeIfDb("FIX-172 — simulador de atendente respeita precedência mesa-primeiro (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let POST: typeof import("./route").POST;
	let routing: typeof import("@/lib/whatsapp/mesa/routing");

	const SUFFIX = Date.now().toString(36);
	const PHONE = `5564${Math.floor(900000000 + Math.random() * 90000000)}`;
	const USER_ID = randomUUID();

	const convIds: string[] = [];
	const userIds: string[] = [];
	const mesaAttendantIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ POST } = await import("./route"));
		routing = await import("@/lib/whatsapp/mesa/routing");

		// user (role=attendant) — quem aparece no dropdown do simulador.
		await db.insert(schema.user).values({
			id: USER_ID,
			name: `E2E Mesa Sim ${SUFFIX}`,
			email: `e2e-mesa-sim-${SUFFIX}@teste.local`,
			phone: PHONE,
			role: "attendant",
			isActive: true,
		});
		userIds.push(USER_ID);

		// mesmo telefone cadastrado como atendente de MESA — é isso que dispara a
		// precedência (isMesaAttendantPhone) em processor.ts.
		const [mesaAttendant] = await db
			.insert(schema.mesaAttendants)
			.values({ nome: `E2E Mesa Sim ${SUFFIX}`, whatsapp: PHONE, isActive: true })
			.returning({ id: schema.mesaAttendants.id });
		mesaAttendantIds.push(mesaAttendant.id);
		routing.invalidateMesaAttendantCache();

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: conv.id, name: "Cliente Mesa Sim", stage: "em_atendimento" })
			.returning({ id: schema.leads.id });
		await db.insert(schema.mesaHandoffs).values({
			leadId: lead.id,
			conversationId: conv.id,
			mesaAttendantId: mesaAttendant.id,
			status: "em_andamento",
		});
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		for (const id of mesaAttendantIds) {
			await db.delete(schema.mesaAttendants).where(eq(schema.mesaAttendants.id, id));
		}
		for (const id of userIds) {
			await db.delete(schema.user).where(eq(schema.user.id, id));
		}
	});

	it("texto de um atendente que TAMBÉM é atendente de mesa vai pro COPILOTO, não pro chat de vendas", async () => {
		const res = await POST(replyReq("como faço pra emitir o boleto na administradora?"), {
			params: Promise.resolve({ attendantId: USER_ID }),
		});
		expect(res.status).toBe(200);

		// A prova de que passou pelo copiloto: generateMesaCopilotReply foi chamado
		// E a fala do atendente foi persistida em mesa_copilot_messages.
		expect(generateMesaCopilotReply).toHaveBeenCalledTimes(1);

		const messages = await db
			.select()
			.from(schema.mesaCopilotMessages)
			.innerJoin(schema.mesaHandoffs, eq(schema.mesaCopilotMessages.mesaHandoffId, schema.mesaHandoffs.id))
			.where(eq(schema.mesaHandoffs.mesaAttendantId, mesaAttendantIds[0]));

		const attendantTurn = messages.find(
			(m) => m.mesa_copilot_messages.role === "attendant" &&
				m.mesa_copilot_messages.content === "como faço pra emitir o boleto na administradora?",
		);
		expect(attendantTurn).toBeTruthy();
	});
});
