// FIX-124 (D15/D16) — broadcast + dispatch do claim (integration-db). Espelha o
// handoffToAgents do chat de vendas: broadcast a TODOS + primeiro a clicar assume.
// Mocka só a fronteira externa (WhatsApp API) e o LLM do copiloto — DB é real.
// O ponto crítico é a CORRIDA de 2 cliques em "Vou atender": exatamente 1 vence.
// Skip se DATABASE_URL ausente.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const sendReplyButtons = vi.fn(async (..._args: unknown[]) => ({ messageId: "sim-1" }));
const sendTextMessage = vi.fn(async (..._args: unknown[]) => ({ messageId: "sim-1" }));
const generateMesaCopilotReply = vi.fn(async (..._args: unknown[]) => "orientação do copiloto");

vi.mock("@/lib/whatsapp/api", () => ({
	sendReplyButtons: (...a: unknown[]) => sendReplyButtons(...a),
	sendTextMessage: (...a: unknown[]) => sendTextMessage(...a),
}));
vi.mock("@/lib/agent/mesa-copilot", () => ({
	generateMesaCopilotReply: (...a: unknown[]) => generateMesaCopilotReply(...a),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-124 — broadcast + claim dispatch (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let outbound: typeof import("./outbound");
	let routing: typeof import("./routing");

	const convIds: string[] = [];
	const attendantIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		outbound = await import("./outbound");
		routing = await import("./routing");
	});

	afterEach(() => {
		// As asserções filtram por telefone semeado, então não é preciso isolar a lista de
		// atendentes entre testes (o claim referencia o handoff por FK; deletar o atendente
		// aqui violaria a FK enquanto o handoff existe). Limpeza vai no afterAll, na ordem
		// certa (conversations cascateiam os handoffs, liberando os atendentes).
		routing.invalidateMesaAttendantCache();
		sendReplyButtons.mockClear();
		sendTextMessage.mockClear();
		generateMesaCopilotReply.mockClear();
	});

	afterAll(async () => {
		// 1º conversations (cascade → leads → mesa_handoffs), depois atendentes (FK livre).
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		for (const id of attendantIds) {
			await db.delete(schema.mesaAttendants).where(eq(schema.mesaAttendants.id, id));
		}
	});

	// Telefone único por run — o DB é compartilhado entre arquivos de teste (whatsapp é
	// UNIQUE). Broadcast vai pra TODOS os ativos, então asserções filtram por ESTES fones.
	function uniquePhone(): string {
		return `5563${randomUUID().replace(/\D/g, "").slice(0, 9).padEnd(9, "0")}`;
	}

	async function seedAttendant(nome: string) {
		const whatsapp = uniquePhone();
		const [a] = await db
			.insert(schema.mesaAttendants)
			.values({ nome, whatsapp, isActive: true })
			.returning({ id: schema.mesaAttendants.id });
		attendantIds.push(a.id);
		routing.invalidateMesaAttendantCache();
		return { id: a.id, whatsapp };
	}

	async function seedOwnerlessHandoff() {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: conv.id, name: "Cliente Broadcast", stage: "na_administradora" })
			.returning({ id: schema.leads.id });
		const [h] = await db
			.insert(schema.mesaHandoffs)
			.values({ leadId: lead.id, conversationId: conv.id, mesaAttendantId: null, status: "aberto" })
			.returning({ id: schema.mesaHandoffs.id });
		return { handoffId: h.id, leadId: lead.id };
	}

	it("broadcast manda botão 'Vou atender' aos atendentes ativos (1 por atendente)", async () => {
		const a = await seedAttendant("Ana");
		const b = await seedAttendant("Bruno");
		const { handoffId } = await seedOwnerlessHandoff();

		await outbound.broadcastCaseToAttendants(handoffId, {
			lead: { name: "Cliente Broadcast", phone: null },
			proposal: null,
		});

		// Filtra pelos MEUS fones (o DB compartilhado pode ter outros ativos de testes paralelos).
		const mine = sendReplyButtons.mock.calls.filter((c) => [a.whatsapp, b.whatsapp].includes(c[0] as string));
		expect(mine.map((c) => c[0]).sort()).toEqual([a.whatsapp, b.whatsapp].sort());
		for (const call of mine) {
			const buttons = call[2] as Array<{ id: string; title: string }>;
			expect(buttons[0].title).toBe("Vou atender");
			expect(buttons[0].id).toContain(handoffId);
		}
	});

	it("2 cliques concorrentes em 'Vou atender' → EXATAMENTE 1 assume", async () => {
		const a = await seedAttendant("Corrida A");
		const b = await seedAttendant("Corrida B");
		const { handoffId } = await seedOwnerlessHandoff();
		const replyId = `${outbound.CLAIM_BUTTON_ID_PREFIX}${handoffId}`;

		await Promise.all([
			routing.handleMesaClaim(a.whatsapp, replyId),
			routing.handleMesaClaim(b.whatsapp, replyId),
		]);

		const [row] = await db
			.select()
			.from(schema.mesaHandoffs)
			.where(eq(schema.mesaHandoffs.id, handoffId));
		expect([a.id, b.id]).toContain(row.mesaAttendantId);
		expect(row.status).toBe("em_andamento");

		// os 2 atendentes receberam mensagem (1 "assumiu", 1 "já assumido")
		const recipients = sendTextMessage.mock.calls.map((c) => c[0]);
		expect(recipients).toContain(a.whatsapp);
		expect(recipients).toContain(b.whatsapp);
	});

	it("pós-claim, mensagem de um NÃO-dono NÃO vaza pro copiloto do caso", async () => {
		const a = await seedAttendant("Dono");
		const b = await seedAttendant("NaoDono");
		const { handoffId } = await seedOwnerlessHandoff();

		await routing.handleMesaClaim(a.whatsapp, `${outbound.CLAIM_BUTTON_ID_PREFIX}${handoffId}`);
		sendTextMessage.mockClear();

		// B (não assumiu) manda uma mensagem → copiloto não deve responder pelo caso de A
		await routing.handleMesaCopilot(b.whatsapp, "como faço na administradora?");

		expect(generateMesaCopilotReply).not.toHaveBeenCalled();
		const bReplies = sendTextMessage.mock.calls.filter((c) => c[0] === b.whatsapp);
		expect(bReplies.length).toBeGreaterThan(0);
		expect(String(bReplies[0][1])).toContain("Nenhum caso aberto");
	});
});
