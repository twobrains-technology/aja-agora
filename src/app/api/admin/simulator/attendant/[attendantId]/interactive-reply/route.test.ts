// QA autônomo Frente 3 (2026-07-01) — FIX-174: o Simulador de Atendente só sabia
// mandar TEXTO livre; não existia caminho pra simular o clique no botão interativo
// "Vou atender" (mesa_claim:<handoffId>), então o claim atômico da mesa (D16) nunca
// pôde ser exercitado por uma TELA real — só por integration chamando
// handleMesaClaim direto. Esta rota espelha /api/admin/simulator/whatsapp/[id]/send
// (kind=interactive): chama processInteractiveReply, o MESMO entrypoint do webhook
// real, garantindo a precedência mesa-primeiro (processor.ts).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsapp/api", () => ({
	sendTextMessage: vi.fn(async () => ({ messageId: "sim-1" })),
	sendReplyButtons: vi.fn(async () => ({ messageId: "sim-1" })),
}));
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({ error: null, session: { user: { id: "test-admin" } } })),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function req(body: unknown) {
	return new Request("http://test/api/admin/simulator/attendant/x/interactive-reply", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describeIfDb("FIX-174 — simulador de atendente: clique interativo (claim da mesa)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let POST: typeof import("./route").POST;
	let routing: typeof import("@/lib/whatsapp/mesa/routing");
	let outbound: typeof import("@/lib/whatsapp/mesa/outbound");

	const SUFFIX = Date.now().toString(36);
	const PHONE_A = `5565${Math.floor(900000000 + Math.random() * 90000000)}`;
	const PHONE_B = `5565${Math.floor(900000000 + Math.random() * 90000000)}`;
	const USER_A = randomUUID();
	const USER_B = randomUUID();

	const convIds: string[] = [];
	const userIds: string[] = [USER_A, USER_B];
	const mesaAttendantIds: string[] = [];
	let handoffId: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ POST } = await import("./route"));
		routing = await import("@/lib/whatsapp/mesa/routing");
		outbound = await import("@/lib/whatsapp/mesa/outbound");

		await db.insert(schema.user).values([
			{ id: USER_A, name: `E2E Claim A ${SUFFIX}`, email: `e2e-claim-a-${SUFFIX}@teste.local`, phone: PHONE_A, role: "attendant", isActive: true },
			{ id: USER_B, name: `E2E Claim B ${SUFFIX}`, email: `e2e-claim-b-${SUFFIX}@teste.local`, phone: PHONE_B, role: "attendant", isActive: true },
		]);

		const created = await db
			.insert(schema.mesaAttendants)
			.values([
				{ nome: `E2E Claim A ${SUFFIX}`, whatsapp: PHONE_A, isActive: true },
				{ nome: `E2E Claim B ${SUFFIX}`, whatsapp: PHONE_B, isActive: true },
			])
			.returning({ id: schema.mesaAttendants.id });
		mesaAttendantIds.push(...created.map((c) => c.id));
		routing.invalidateMesaAttendantCache();

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: conv.id, name: "Cliente Claim Sim", stage: "em_atendimento" })
			.returning({ id: schema.leads.id });
		const [handoff] = await db
			.insert(schema.mesaHandoffs)
			.values({ leadId: lead.id, conversationId: conv.id, mesaAttendantId: null, status: "aberto" })
			.returning({ id: schema.mesaHandoffs.id });
		handoffId = handoff.id;
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

	it("clique de 'Vou atender' via simulador assume o handoff (mesmo claim atômico do webhook real)", async () => {
		const replyId = `${outbound.CLAIM_BUTTON_ID_PREFIX}${handoffId}`;
		const res = await POST(req({ replyId, replyTitle: "Vou atender" }), {
			params: Promise.resolve({ attendantId: USER_A }),
		});
		expect(res.status).toBe(200);

		const [row] = await db
			.select()
			.from(schema.mesaHandoffs)
			.where(eq(schema.mesaHandoffs.id, handoffId));
		expect(row.mesaAttendantId).toBe(mesaAttendantIds[0]);
		expect(row.status).toBe("em_andamento");
	});
});
