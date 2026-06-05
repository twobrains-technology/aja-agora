/**
 * BUG: conversa do SIMULADOR no canal WHATSAPP não vira lead na pipeline.
 *
 * Bug detectado: após o fix anterior (commit 90ceda3) que removeu o filtro
 * `isSimulated=false` em GET /api/admin/leads e habilitou stage promotion
 * em saveContactName/saveContactWhatsapp, o canal WEB do simulador volta
 * a aparecer no kanban. WhatsApp NÃO — o estado do DB confirma:
 *
 *    SELECT c.id, c.channel, c.wa_id, c.is_simulated,
 *           (SELECT COUNT(*) FROM leads l WHERE l.conversation_id=c.id) AS leads
 *      FROM conversations c
 *     WHERE c.is_simulated=true AND c.channel='whatsapp';
 *
 * → 5 conversas, 4 com leads=0 (e a única com 1 foi via handoff, não captura).
 *
 * Causa-raiz (hipótese): POST /api/admin/simulator/sessions com channel="whatsapp"
 * cria a conversation com waId='SIM-<uuid>' direto via `db.insert(conversations)`,
 * PULANDO `getOrCreateConversation(waId)` (src/lib/whatsapp/session.ts:21-69) — que
 * é onde o lead inicial seria semeado (linhas 44-55).
 *
 * Quando o usuário envia a primeira mensagem pelo simulador WhatsApp,
 * `processTextMessage` chama `processWithOrchestrator` → `getOrCreateConversation`,
 * mas como a conversa já existe (waId já cadastrado), ela retorna {isNew:false}
 * SEM disparar a criação do lead inicial. Resultado: conversa simulada de
 * whatsapp existe mas nunca tem lead correspondente.
 *
 * Contrato afirmado pelo teste: ao criar uma sessão simulada channel="whatsapp"
 * (mesma chamada usada pelo Painel Admin) e processar uma primeira mensagem
 * pelo mesmo caminho que o webhook real chama, o lead DEVE existir e DEVE
 * aparecer no GET /api/admin/leads.
 *
 * Integration test: bate no DB real (aja-pg-develop, 5434).
 */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leadEvents, leads, messages } from "@/db/schema";

// requireRole consulta better-auth via headers() — mockamos pra rodar as rotas
// como admin sem subir todo o ciclo de cookie/sessão.
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi
		.fn()
		.mockResolvedValue({ error: null, session: { user: { id: "test-admin", role: "admin" } } }),
}));

// O processor real chama LLM via processWithOrchestrator. Não queremos
// dependência de modelo nem de API key neste teste — mockamos só a chamada
// do orchestrator. O resto do pipeline (processTextMessage, session resolution
// e CRIAÇÃO DO LEAD) é o real, que é o que estamos testando.
vi.mock("@/lib/whatsapp/adapter", () => ({
	processWithOrchestrator: vi.fn().mockResolvedValue(undefined),
}));

// Não há proxy/handoff/attendant configurado neste cenário.
vi.mock("@/lib/whatsapp/proxy", () => ({
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	handleAgentMessage: vi.fn(),
	handlePendingHandoffText: vi.fn().mockResolvedValue(false),
	isAttendantPhone: vi.fn().mockResolvedValue(false),
	relayUserToAgent: vi.fn(),
}));

// Typing indicator não interessa pro contrato de criação de lead.
vi.mock("@/lib/whatsapp/api", () => ({
	sendTextMessage: vi.fn().mockResolvedValue(undefined),
	sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
	sendInteractiveMessage: vi.fn().mockResolvedValue(undefined),
}));

const { POST: createSession } = await import("@/app/api/admin/simulator/sessions/route");
const { POST: sendSimMessage } = await import(
	"@/app/api/admin/simulator/whatsapp/[conversationId]/send/route"
);
const { GET: listLeads } = await import("@/app/api/admin/leads/route");
const { processTextMessage } = await import("@/lib/whatsapp/processor");

type SessionsResponse = {
	conversationId: string;
	channel: "web" | "whatsapp";
	waId: string | null;
};

type LeadsResponse = {
	leads: Record<
		string,
		Array<{ id: string; name: string | null; phone: string | null; conversationId: string }>
	>;
	stages: string[];
};

async function cleanupConversation(convId: string): Promise<void> {
	const leadRows = await db.query.leads.findMany({
		where: eq(leads.conversationId, convId),
	});
	for (const l of leadRows) {
		await db.delete(leadEvents).where(eq(leadEvents.leadId, l.id));
	}
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(messages).where(eq(messages.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describe("BUG: simulador WhatsApp não cria lead na pipeline", () => {
	const createdConvIds: string[] = [];

	beforeEach(() => {
		createdConvIds.length = 0;
	});

	afterEach(async () => {
		for (const id of createdConvIds) {
			await cleanupConversation(id);
		}
	});

	it("criar sessão simulada channel=whatsapp + processar 1ª msg → lead DEVE existir e aparecer em /api/admin/leads", async () => {
		// 1) Cria sessão simulada whatsapp pelo MESMO endpoint que o Painel Admin chama.
		const createReq = new NextRequest("http://localhost/api/admin/simulator/sessions", {
			method: "POST",
			body: JSON.stringify({ channel: "whatsapp" }),
			headers: { "content-type": "application/json" },
		});
		const createRes = await createSession(createReq);
		expect(createRes.status).toBe(201);
		const session = (await createRes.json()) as SessionsResponse;
		createdConvIds.push(session.conversationId);

		expect(session.channel).toBe("whatsapp");
		expect(session.waId).toMatch(/^SIM-/);
		const waId = session.waId as string;

		// 2) Dispara o MESMO entrypoint que o webhook real chama quando uma msg
		//    chega. Esse é exatamente o caminho de produção do WhatsApp — não
		//    inventamos atalho. Se aqui não criar lead, prod também não cria.
		await processTextMessage(waId, "oi, quero comprar uma moto");

		// 3) Lead deve existir no DB pra essa conversation. Esta é a asserção
		//    mais crítica: o ponto exato onde o bug se manifesta.
		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, session.conversationId),
		});
		expect(
			lead,
			"BUG: nenhum lead foi criado pra conversa simulada whatsapp após receber mensagem",
		).toBeDefined();

		// 4) GET /api/admin/leads precisa retornar esse lead. Esta é a asserção
		//    de produto: o stakeholder abre o kanban e VÊ o lead.
		const listRes = await listLeads();
		expect(listRes.status).toBe(200);
		const body = (await listRes.json()) as LeadsResponse;

		const allReturned = Object.values(body.leads).flat();
		const found = allReturned.find((l) => l.conversationId === session.conversationId);
		expect(
			found,
			"BUG: lead da conversa simulada whatsapp NÃO apareceu em GET /api/admin/leads",
		).toBeDefined();
	});

	it("paridade: rota /api/admin/simulator/whatsapp/.../send (a que o painel chama de fato) também produz lead", async () => {
		// Replica o caminho exato do painel: cria sessão + chama o endpoint de
		// envio simulado. Isso garante que mesmo o ACK rápido (fire-and-forget)
		// que aguardamos abaixo termina criando o lead.
		const createReq = new NextRequest("http://localhost/api/admin/simulator/sessions", {
			method: "POST",
			body: JSON.stringify({ channel: "whatsapp" }),
			headers: { "content-type": "application/json" },
		});
		const createRes = await createSession(createReq);
		const session = (await createRes.json()) as SessionsResponse;
		createdConvIds.push(session.conversationId);

		const sendReq = new NextRequest(
			`http://localhost/api/admin/simulator/whatsapp/${session.conversationId}/send`,
			{
				method: "POST",
				body: JSON.stringify({ kind: "text", text: "oi" }),
				headers: { "content-type": "application/json" },
			},
		);
		const sendRes = await sendSimMessage(sendReq, {
			params: Promise.resolve({ conversationId: session.conversationId }),
		});
		expect(sendRes.status).toBe(204);

		// Como o send é fire-and-forget (void processTextMessage(...)), damos
		// alguns ciclos do event loop pra ele rodar até a parte síncrona de
		// session resolution + criação de lead (que NÃO depende do LLM porque
		// processWithOrchestrator foi mockado).
		for (let i = 0; i < 20; i++) {
			await new Promise((r) => setImmediate(r));
		}

		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, session.conversationId),
		});
		expect(lead, "BUG: send pelo painel admin WhatsApp não disparou criação de lead").toBeDefined();
	});
});
