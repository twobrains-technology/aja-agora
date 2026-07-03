// E2E do fluxo da MESA de operação — SEM tela, SEM browser, SEM vídeo. Dirige os
// route handlers REAIS (POST /transbordo + POST /conversations/[id]/message) e a
// lógica de claim contra o Postgres REAL, mockando só a fronteira externa:
// WhatsApp/Meta (`@/lib/whatsapp/api`), a janela de 24h (`@/lib/whatsapp/window`)
// e o guard de auth (`requireRole` = admin). Cobre o caminho do admin ponta a ponta:
//   transbordo → broadcast a todos → claim (raia em_atendimento) → shadow do 2º →
//   mensagem ao cliente → invariantes (idempotência 409, janela fechada 429, lead 404).
// Roda em test:integration (precisa DATABASE_URL real); pula com sentinel/sem DB.

import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendTextMessage = vi.fn(async (..._a: unknown[]) => ({ messageId: "sim-txt" }));
const sendReplyButtons = vi.fn(async (..._a: unknown[]) => ({ messageId: "sim-btn" }));
const sendTemplate = vi.fn(async (..._a: unknown[]) => ({ messageId: "sim-tpl" }));
const isWindowOpenMock = vi.fn(async (..._a: unknown[]) => ({ open: true }) as { open: boolean });
const requireRoleMock = vi.fn(async (..._a: unknown[]) => ({
	error: null,
	session: { user: { id: "e2e-admin" } },
}));

vi.mock("@/lib/whatsapp/api", () => ({
	sendTextMessage: (...a: unknown[]) => sendTextMessage(...a),
	sendReplyButtons: (...a: unknown[]) => sendReplyButtons(...a),
	sendTemplate: (...a: unknown[]) => sendTemplate(...a),
}));
vi.mock("@/lib/whatsapp/window", () => ({
	isWindowOpen: (...a: unknown[]) => isWindowOpenMock(...a),
}));
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: (...a: unknown[]) => requireRoleMock(...a),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function jsonReq(body: unknown) {
	return new Request("http://test/api/admin", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describeIfDb(
	"E2E fluxo da mesa (route-level, DB real) — transbordo → broadcast → claim → mensagem",
	() => {
		let db: typeof import("@/db").db;
		let schema: typeof import("@/db/schema");
		let transbordoPOST: typeof import("@/app/api/admin/leads/[id]/transbordo/route").POST;
		let messagePOST: typeof import("@/app/api/admin/conversations/[id]/message/route").POST;
		let handleMesaClaim: typeof import("@/lib/whatsapp/mesa/routing").handleMesaClaim;
		let invalidateMesaAttendantCache: typeof import("@/lib/whatsapp/mesa/routing").invalidateMesaAttendantCache;
		let CLAIM_PREFIX: string;
		// mesa_handoffs.created_by tem FK pra user(id) — o admin do session precisa existir no DB.
		let adminUserId: string;

		const convIds: string[] = [];
		const attendantIds: string[] = [];
		const administradoraIds: string[] = [];

		// whatsapp é UNIQUE e o DB é compartilhado entre arquivos → fone único por seed.
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
			invalidateMesaAttendantCache(); // broadcast lê getMesaAttendantList (cache 60s)
			return { id: a.id, whatsapp };
		}

		async function seedAdministradora(nome: string, slug: string) {
			const [a] = await db
				.insert(schema.administradoras)
				.values({ nome, slug })
				.returning({ id: schema.administradoras.id });
			administradoraIds.push(a.id);
			return a;
		}

		async function seedLead(opts: { administradoraVarchar: string | null }) {
			const waId = uniquePhone();
			const [conv] = await db
				.insert(schema.conversations)
				.values({ channel: "whatsapp", status: "active", waId, metadata: {} })
				.returning({ id: schema.conversations.id });
			convIds.push(conv.id);
			const [lead] = await db
				.insert(schema.leads)
				.values({
					conversationId: conv.id,
					name: "Cliente E2E",
					phone: waId,
					stage: "na_administradora",
				})
				.returning({ id: schema.leads.id });
			await db.insert(schema.beviProposals).values({
				conversationId: conv.id,
				leadId: lead.id,
				proposalId: `PROP-${conv.id.slice(0, 8)}`,
				administradora: opts.administradoraVarchar,
				grupo: "1234",
				creditValue: "200000.00",
				monthlyPayment: "1200.00",
				segmento: "imovel",
				termMonths: 180,
			});
			return { conversationId: conv.id, leadId: lead.id, waId };
		}

		beforeAll(async () => {
			({ db } = await import("@/db"));
			schema = await import("@/db/schema");
			({ POST: transbordoPOST } = await import("@/app/api/admin/leads/[id]/transbordo/route"));
			({ POST: messagePOST } = await import("@/app/api/admin/conversations/[id]/message/route"));
			const routing = await import("@/lib/whatsapp/mesa/routing");
			handleMesaClaim = routing.handleMesaClaim;
			invalidateMesaAttendantCache = routing.invalidateMesaAttendantCache;
			CLAIM_PREFIX = (await import("@/lib/whatsapp/mesa/outbound")).CLAIM_BUTTON_ID_PREFIX;

			adminUserId = `e2e-admin-${randomUUID().slice(0, 8)}`;
			await db.insert(schema.user).values({
				id: adminUserId,
				name: "E2E Admin",
				email: `${adminUserId}@test.local`,
				role: "admin",
			});
		});

		beforeEach(() => {
			sendTextMessage.mockClear();
			sendReplyButtons.mockClear();
			sendTemplate.mockClear();
			isWindowOpenMock.mockResolvedValue({ open: true });
			requireRoleMock.mockResolvedValue({ error: null, session: { user: { id: adminUserId } } });
		});

		afterAll(async () => {
			for (const id of convIds) {
				await db.delete(schema.messages).where(eq(schema.messages.conversationId, id));
			}
			for (const id of convIds) {
				// cascade: leads → mesa_handoffs / bevi_proposals / stage events
				await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
			}
			if (attendantIds.length) {
				await db
					.delete(schema.mesaAttendants)
					.where(inArray(schema.mesaAttendants.id, attendantIds));
			}
			if (administradoraIds.length) {
				await db
					.delete(schema.administradoras)
					.where(inArray(schema.administradoras.id, administradoraIds));
			}
			// user por último: created_by dos handoffs já caiu junto com as conversas acima.
			if (adminUserId) {
				await db.delete(schema.user).where(eq(schema.user.id, adminUserId));
			}
		});

		it("caminho do admin: transbordo cria handoff SEM dono + broadcast → claim de A move a raia p/ em_atendimento → B é sombreado → mensagem ao cliente persiste", async () => {
			const a = await seedAttendant("Ana E2E");
			const b = await seedAttendant("Bruno E2E");
			await seedAdministradora("Canopus", "canopus");
			const { conversationId, leadId, waId } = await seedLead({ administradoraVarchar: "CANOPUS" });

			// 1) TRANSBORDO (rota real) — nasce sem dono, status aberto
			const tRes = await transbordoPOST(jsonReq({}), { params: Promise.resolve({ id: leadId }) });
			expect(tRes.status).toBe(201);
			const tBody = (await tRes.json()) as {
				handoff: { id: string; mesaAttendantId: string | null; status: string };
				outboundError?: string;
			};
			expect(tBody.handoff.mesaAttendantId).toBeNull();
			expect(tBody.handoff.status).toBe("aberto");
			const handoffId = tBody.handoff.id;

			// broadcast do botão "Vou atender" foi pros MEUS 2 atendentes (DB é compartilhado → filtra)
			const broadcasted = sendReplyButtons.mock.calls
				.map((c) => c[0] as string)
				.filter((p) => [a.whatsapp, b.whatsapp].includes(p));
			expect(broadcasted.sort()).toEqual([a.whatsapp, b.whatsapp].sort());

			// 2) CLAIM de A (clique "Vou atender") → handoff em_andamento + raia em_atendimento
			await handleMesaClaim(a.whatsapp, `${CLAIM_PREFIX}${handoffId}`);
			const [h] = await db
				.select()
				.from(schema.mesaHandoffs)
				.where(eq(schema.mesaHandoffs.id, handoffId));
			expect(h.mesaAttendantId).toBe(a.id);
			expect(h.status).toBe("em_andamento");
			const [ld] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
			expect(ld.stage).toBe("em_atendimento");

			// 3) SHADOW: B tenta assumir depois → rejeitado; dono continua A e recebe "já assumido"
			sendTextMessage.mockClear();
			await handleMesaClaim(b.whatsapp, `${CLAIM_PREFIX}${handoffId}`);
			const [h2] = await db
				.select()
				.from(schema.mesaHandoffs)
				.where(eq(schema.mesaHandoffs.id, handoffId));
			expect(h2.mesaAttendantId).toBe(a.id);
			const bReplies = sendTextMessage.mock.calls.filter((c) => c[0] === b.whatsapp);
			expect(bReplies.length).toBeGreaterThan(0);
			expect(String(bReplies[0][1]).toLowerCase()).toContain("assumido");

			// 4) MENSAGEM ao cliente (rota real, janela aberta) → envia ao waId e persiste como assistant
			sendTextMessage.mockClear();
			const texto = "Oi! Recebi seus documentos, seguindo o cadastro na administradora.";
			const mRes = await messagePOST(jsonReq({ text: texto }), {
				params: Promise.resolve({ id: conversationId }),
			});
			expect(mRes.status).toBe(200);
			const mBody = (await mRes.json()) as { success: boolean; type: string };
			expect(mBody.success).toBe(true);
			expect(mBody.type).toBe("text");
			expect(sendTextMessage.mock.calls.some((c) => c[0] === waId && c[1] === texto)).toBe(true);
			const msgs = await db
				.select()
				.from(schema.messages)
				.where(eq(schema.messages.conversationId, conversationId));
			expect(
				msgs.some((m) => m.role === "assistant" && String(m.content).includes("documentos")),
			).toBe(true);
		});

		it("idempotência: 2º POST /transbordo do mesmo lead com handoff ativo → 409 handoff_ativo_existe", async () => {
			const { leadId } = await seedLead({ administradoraVarchar: null });
			const r1 = await transbordoPOST(jsonReq({}), { params: Promise.resolve({ id: leadId }) });
			expect(r1.status).toBe(201);
			const r2 = await transbordoPOST(jsonReq({}), { params: Promise.resolve({ id: leadId }) });
			expect(r2.status).toBe(409);
			expect((await r2.json()).error).toBe("handoff_ativo_existe");
		});

		it("janela de 24h fechada: POST /message com texto livre → 429 WindowClosed", async () => {
			const { conversationId } = await seedLead({ administradoraVarchar: null });
			isWindowOpenMock.mockResolvedValueOnce({ open: false } as { open: boolean });
			const res = await messagePOST(jsonReq({ text: "oi" }), {
				params: Promise.resolve({ id: conversationId }),
			});
			expect(res.status).toBe(429);
			expect((await res.json()).error).toBe("WindowClosed");
			expect(sendTextMessage).not.toHaveBeenCalled();
		});

		it("janela fechada + template: POST /message com {templateName, languageCode} → 200 envia HSM e persiste", async () => {
			const { conversationId, waId } = await seedLead({ administradoraVarchar: null });
			isWindowOpenMock.mockResolvedValueOnce({ open: false } as { open: boolean });
			const res = await messagePOST(
				jsonReq({ templateName: "aja_reengajamento", languageCode: "pt_BR" }),
				{ params: Promise.resolve({ id: conversationId }) },
			);
			expect(res.status).toBe(200);
			expect((await res.json()).type).toBe("template");
			// é o caminho que o ClientChatBox dispara quando a janela está fechada
			expect(sendTemplate).toHaveBeenCalledWith(waId, "aja_reengajamento", "pt_BR");
			const msgs = await db
				.select()
				.from(schema.messages)
				.where(eq(schema.messages.conversationId, conversationId));
			expect(msgs.some((m) => m.role === "assistant")).toBe(true);
		});

		it("lead inexistente: POST /transbordo → 404", async () => {
			const res = await transbordoPOST(jsonReq({}), {
				params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
			});
			expect(res.status).toBe(404);
		});
	},
);
