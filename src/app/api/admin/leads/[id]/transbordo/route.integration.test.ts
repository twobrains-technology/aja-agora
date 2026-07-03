// QA Noturno 2026-06-22 — Coerência E2E do transbordo (NÍVEL DE ROTA + anti-leak de PDF
// entre administradoras). Pedido do Kairo: validar a COERÊNCIA do transbordo
//   kanban → mesa administradora → WhatsApp do atendente → copiloto orienta o operador
// com o manual da administradora CERTA.
//
// Os testes existentes cobrem PEÇAS isoladas (createMesaHandoff no lib, handleMesaCopilot
// com 1 administradora). Faltava: (a) a ROTA POST de verdade disparando o outbound, e
// (b) provar que, com DUAS administradoras no banco, o copiloto orienta com o manual da
// administradora DA COTA e NUNCA vaza o da outra.
//
// Spec: docs/visao/mesa-de-operacao.md §4-5 (fluxo) + §8 (PII, sem colisão de canal).
// Mocka SÓ a borda externa: requireRole (admin), WhatsApp (sendTextMessage) e o LLM
// (generateMesaCopilotReply — capturamos o `caso` montado). DB REAL (workspace OrbStack).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	sendTextMock: vi.fn().mockResolvedValue({ messageId: "wamid.TEST" }),
	// FIX-124: o broadcast do transbordo usa botão interativo "Vou atender".
	sendButtonsMock: vi.fn().mockResolvedValue({ messageId: "wamid.BTN" }),
	copilotReplyMock: vi.fn().mockResolvedValue("Passo 1: acesse o portal do parceiro."),
}));

// created_by do handoff tem FK pra user.id — o mock precisa de um id de user REAL (semeado).
const ADMIN_USER_ID = "qa-transbordo-admin";
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({
		error: null,
		session: { user: { id: "qa-transbordo-admin" } },
	})),
}));
// outbound.ts importa sendTextMessage + sendReplyButtons de @/lib/whatsapp/api — borda
// externa (Meta). O broadcast (FIX-124) usa sendReplyButtons; o claim/copiloto usam sendText.
vi.mock("@/lib/whatsapp/api", () => ({
	sendTextMessage: mocks.sendTextMock,
	sendReplyButtons: mocks.sendButtonsMock,
	sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
}));
// O LLM do copiloto — capturamos o `caso` pra provar a coerência do manual injetado.
vi.mock("@/lib/agent/mesa-copilot", () => ({
	generateMesaCopilotReply: mocks.copilotReplyMock,
	generateMesaCopilotOpening: vi.fn(async () => "orientação inicial (mock)"),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

import { db } from "@/db";
import {
	administradoraDocs,
	administradoras,
	beviProposals,
	conversations,
	leads,
	mesaAttendants,
	mesaCopilotMessages,
	mesaHandoffs,
	user,
} from "@/db/schema";
import { CLAIM_BUTTON_ID_PREFIX } from "@/lib/whatsapp/mesa/claim";
import {
	handleMesaClaim,
	handleMesaCopilot,
	invalidateMesaAttendantCache,
} from "@/lib/whatsapp/mesa/routing";
import { POST } from "./route";

const MANUAL_X = "MANUAL CANOPUS-X — 1) portal Canopus; 2) informe o grupo; 3) gere a carta.";
const MANUAL_Z = "MANUAL EMBRACON-Z — procedimento COMPLETAMENTE diferente da Embracon.";
const CLIENTE_NOME = "Helena Souza";
const CLIENTE_FONE = "5562999990000";
const CPF_CRU = "529.982.247-25";

type Seed = {
	leadId: string;
	conversationId: string;
	beviProposalId: string;
	attendantId: string;
	attendantPhone: string;
	admXId: string;
	admXNome: string;
	admZId: string;
};

const created: Seed[] = [];

function transbordoReq(leadId: string, body: unknown) {
	return new Request(`http://test/api/admin/leads/${leadId}/transbordo`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function seedCoerencia(): Promise<Seed> {
	const tag = randomUUID().slice(0, 8);
	// Administradora DA COTA (X) com seu manual.
	const [admX] = await db
		.insert(administradoras)
		.values({ nome: `Canopus-${tag}`, slug: `canopus-${tag}` })
		.returning();
	await db.insert(administradoraDocs).values({
		administradoraId: admX.id,
		titulo: "Manual Canopus",
		tipo: "manual",
		storageKey: `s3://test/${randomUUID()}.pdf`,
		textoExtraido: MANUAL_X,
		isActive: true,
	});
	// Administradora DISTRATORA (Z) com OUTRO manual — não pode vazar.
	const [admZ] = await db
		.insert(administradoras)
		.values({ nome: `Embracon-${tag}`, slug: `embracon-${tag}` })
		.returning();
	await db.insert(administradoraDocs).values({
		administradoraId: admZ.id,
		titulo: "Manual Embracon",
		tipo: "manual",
		storageKey: `s3://test/${randomUUID()}.pdf`,
		textoExtraido: MANUAL_Z,
		isActive: true,
	});

	const phone = `55629${Math.floor(100000000 + Math.random() * 800000000)}`;
	const [att] = await db
		.insert(mesaAttendants)
		.values({ nome: "Operador Mesa", whatsapp: phone, isActive: true })
		.returning();

	const [conv] = await db.insert(conversations).values({ channel: "whatsapp" }).returning();
	const [lead] = await db
		.insert(leads)
		.values({
			conversationId: conv.id,
			name: CLIENTE_NOME,
			phone: CLIENTE_FONE,
			stage: "na_administradora",
		})
		.returning();
	// Proposta da Bevi aponta pra administradora X (varchar = nome exato de X).
	const [prop] = await db
		.insert(beviProposals)
		.values({
			conversationId: conv.id,
			leadId: lead.id,
			proposalId: `prop-${tag}`,
			administradora: admX.nome,
			segmento: "imovel",
			grupo: "4321",
			creditValue: "200000.00",
			monthlyPayment: "1200.00",
			termMonths: 180,
			consortiumProposalLink: `https://bevi.test/proposta/${tag}`,
		})
		.returning();

	const seed: Seed = {
		leadId: lead.id,
		conversationId: conv.id,
		beviProposalId: prop.id,
		attendantId: att.id,
		attendantPhone: phone,
		admXId: admX.id,
		admXNome: admX.nome,
		admZId: admZ.id,
	};
	created.push(seed);
	invalidateMesaAttendantCache();
	return seed;
}

async function cleanup(s: Seed) {
	// Filhos antes dos pais (FKs sem cascade total).
	const handoffs = await db
		.select({ id: mesaHandoffs.id })
		.from(mesaHandoffs)
		.where(eq(mesaHandoffs.leadId, s.leadId));
	for (const h of handoffs) {
		await db.delete(mesaCopilotMessages).where(eq(mesaCopilotMessages.mesaHandoffId, h.id));
	}
	await db.delete(mesaHandoffs).where(eq(mesaHandoffs.leadId, s.leadId));
	await db.delete(beviProposals).where(eq(beviProposals.id, s.beviProposalId));
	await db.delete(leads).where(eq(leads.id, s.leadId));
	await db.delete(conversations).where(eq(conversations.id, s.conversationId));
	await db.delete(mesaAttendants).where(eq(mesaAttendants.id, s.attendantId));
	await db.delete(administradoraDocs).where(eq(administradoraDocs.administradoraId, s.admXId));
	await db.delete(administradoraDocs).where(eq(administradoraDocs.administradoraId, s.admZId));
	await db.delete(administradoras).where(eq(administradoras.id, s.admXId));
	await db.delete(administradoras).where(eq(administradoras.id, s.admZId));
}

describeIfDb("T9 — coerência E2E do transbordo (rota + anti-leak de PDF)", () => {
	beforeAll(async () => {
		// Admin real pra satisfazer a FK created_by → user.id (em prod a sessão tem user real).
		await db
			.insert(user)
			.values({
				id: ADMIN_USER_ID,
				name: "QA Transbordo Admin",
				email: `${ADMIN_USER_ID}@test.local`,
				role: "admin",
			})
			.onConflictDoNothing();
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, ADMIN_USER_ID));
	});

	beforeEach(() => {
		mocks.sendTextMock.mockClear();
		mocks.copilotReplyMock.mockClear();
		invalidateMesaAttendantCache();
	});

	afterEach(async () => {
		while (created.length) {
			const s = created.pop();
			if (s) await cleanup(s);
		}
		invalidateMesaAttendantCache();
	});

	it("ROTA POST /transbordo (FIX-124): handoff SEM dono + BROADCAST (botão 'Vou atender') pro WhatsApp do ATENDENTE, sem CPF", async () => {
		const s = await seedCoerencia();

		// Sem mesaAttendantId no body — o broadcast decide o dono.
		const res = await POST(transbordoReq(s.leadId, {}), {
			params: Promise.resolve({ id: s.leadId }),
		});

		expect(res.status).toBe(201);
		const json = (await res.json()) as { handoff: { id: string }; outboundError?: string };
		expect(json.outboundError).toBeUndefined();

		// Handoff coerente no DB: administradora resolvida pela cota = X (não Z), SEM dono.
		const [h] = await db.select().from(mesaHandoffs).where(eq(mesaHandoffs.id, json.handoff.id));
		expect(h.leadId).toBe(s.leadId);
		expect(h.beviProposalId).toBe(s.beviProposalId);
		expect(h.mesaAttendantId).toBeNull(); // FIX-125: nasce sem dono
		expect(h.administradoraId).toBe(s.admXId);
		expect(h.administradoraId).not.toBe(s.admZId);
		expect(h.status).toBe("aberto");

		// Broadcast: botão interativo foi pro WhatsApp do ATENDENTE, nunca pro cliente.
		// Filtra pela call do NOSSO atendente (o DB compartilhado pode ter outros ativos).
		const myCall = mocks.sendButtonsMock.mock.calls.find((c) => c[0] === s.attendantPhone) as
			| [string, string, Array<{ id: string; title: string }>]
			| undefined;
		expect(myCall).toBeDefined();
		if (!myCall) return;
		const [toNumber, text, buttons] = myCall;
		expect(toNumber).not.toBe(CLIENTE_FONE);
		// Nunca mandou dossiê como TEXTO plano pro atendente (é botão interativo).
		const textCallsToAttendant = mocks.sendTextMock.mock.calls.filter(
			(c) => c[0] === s.attendantPhone,
		);
		expect(textCallsToAttendant).toHaveLength(0);
		// Botão "Vou atender" com id carregando o handoffId (pro claim).
		expect(buttons[0].title).toBe("Vou atender");
		expect(buttons[0].id).toBe(`${CLAIM_BUTTON_ID_PREFIX}${json.handoff.id}`);

		// Dossiê coerente: cliente + cota (grupo/crédito/parcela) + administradora X + link.
		expect(text).toContain(CLIENTE_NOME);
		expect(text).toMatch(/Grupo:\s*4321/);
		expect(text).toContain(s.admXNome);
		expect(text).toContain("https://bevi.test/proposta/");
		// PII minimizada (§8): nunca CPF cru no canal externo.
		expect(text).not.toContain(CPF_CRU);
		expect(text).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
		expect(text.toLowerCase()).not.toMatch(/cpf[:\s]*\d/);
	});

	it("COPILOTO orienta o operador com o manual da administradora DA COTA (X) e NUNCA vaza o da outra (Z) — anti-leak", async () => {
		const s = await seedCoerencia();

		// 1) Transborda via rota real (handoff sem dono + broadcast).
		const res = await POST(transbordoReq(s.leadId, {}), {
			params: Promise.resolve({ id: s.leadId }),
		});
		expect(res.status).toBe(201);
		const json = (await res.json()) as { handoff: { id: string } };

		// 2) Atendente clica "Vou atender" → assume o caso (claim atômico).
		await handleMesaClaim(s.attendantPhone, `${CLAIM_BUTTON_ID_PREFIX}${json.handoff.id}`);
		const [claimed] = await db
			.select()
			.from(mesaHandoffs)
			.where(eq(mesaHandoffs.id, json.handoff.id));
		expect(claimed.mesaAttendantId).toBe(s.attendantId);
		expect(claimed.status).toBe("em_andamento");

		// 3) Atendente (agora dono) responde no WhatsApp → roteia pro copiloto.
		await handleMesaCopilot(s.attendantPhone, "como faço o contrato desse cliente?");

		// 3) O copiloto foi montado com o manual da administradora CERTA (X), não da Z.
		expect(mocks.copilotReplyMock).toHaveBeenCalledTimes(1);
		const caso = mocks.copilotReplyMock.mock.calls[0][0].caso as {
			administradoraNome: string;
			docs: { textoExtraido: string }[];
		};
		const docTexts = caso.docs.map((d) => d.textoExtraido);
		expect(docTexts).toContain(MANUAL_X);
		expect(docTexts).not.toContain(MANUAL_Z);
		expect(caso.administradoraNome).toContain("Canopus");
		expect(caso.administradoraNome).not.toContain("Embracon");

		// 4) Registro do caso: a orientação INICIAL proativa (assistant, empurrada no claim) + a
		//    fala do atendente (attendant) + a resposta do copiloto (assistant) = 2 assistant, 1 attendant.
		const [h] = await db
			.select({ id: mesaHandoffs.id })
			.from(mesaHandoffs)
			.where(eq(mesaHandoffs.leadId, s.leadId));
		const roles = (
			await db.select().from(mesaCopilotMessages).where(eq(mesaCopilotMessages.mesaHandoffId, h.id))
		).map((m) => m.role);
		expect(roles.filter((r) => r === "assistant")).toHaveLength(2);
		expect(roles.filter((r) => r === "attendant")).toHaveLength(1);
	});
});
