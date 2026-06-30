/**
 * FIX-48 — Proposta web nasce SEM `leadId` e a raia trava em `qualificado`.
 *
 * Bug real (Kairo, 2026-06-15): fluxo WEB (chat teatro) — usuário simula, recebe
 * oferta, clica "Contratar", preenche `contract_form`, sobe documentos. A proposta
 * Bevi é gerada, mas o lead permanece em `qualificado` no kanban — nunca avança
 * pra `proposta_enviada`, e o polling de status nunca consegue movê-lo (leadId null).
 *
 * Cadeia provada no código:
 *   route.ts contract-submit → buildStartContractInput(meta, identity)  ← NÃO incluía leadId
 *     → startContract → createBeviProposal(conv, snapshot, input.leadId=undefined)
 *       → guard `if (leadId)` falha → transitionLeadStage NUNCA roda.
 *
 * Estes testes tocam o Postgres REAL (RUN_DB_TESTS=1, dentro do container ou via
 * DNS .orb.local do workspace). Gateway Bevi injetado (MockProposalGateway) —
 * nunca toca a API real. NÃO é cassette (bug não-agêntico, sem streamText).
 *
 * Cobre as DUAS pontas da correção:
 *   A) caminho feliz web: o route resolve o leadId da conversa e o injeta → a
 *      proposta nasce vinculada E a raia avança (qualificado→proposta_enviada).
 *   B) resgate retroativo: proposta órfã (leadId null) + POST /api/leads → o lead
 *      criado RELIGA a proposta e dispara a transição (cura a corrida "lead depois
 *      da proposta", que é o que o WhatsApp mascarava e o web não resgatava).
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	artifacts as artifactsTable,
	beviProposals,
	conversations,
	leadEvents,
	leads,
	messages as messagesTable,
} from "@/db/schema";
import { __setProposalGatewayForTests } from "@/lib/adapters";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { createBeviProposal } from "@/lib/bevi/proposal-repo";
import { MockProposalGateway } from "../../../../tests/helpers/mock-proposal-gateway";

const run = process.env.RUN_DB_TESTS === "1";

// contract-submit cifra a identidade (storeIdentity) — chave pode estar ausente
// em teste (lição: env vazio do compose). Mesmo fallback do eval/closing-persistence.
if (!process.env.IDENTITY_ENC_KEY) {
	process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
}

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

// Memory adapter desligado pra evitar Letta no teste (mesmo padrão de closing-persistence).
vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

// Handoff (WhatsApp) não deve ser exercitado aqui — religação é DB puro.
vi.mock("@/lib/whatsapp/proxy", () => ({
	handoffToAgents: vi.fn().mockResolvedValue(undefined),
	relayWebUserToAgent: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import("./route");
const { POST: POST_LEADS } = await import("../leads/route");

// Estado de fechamento legítimo: reveal concluído (FIX-12) + categoria/admin.
const CLOSED_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	qualifyAnswers: { creditMax: 46000, prazoMeses: 8 },
	revealCompleted: true,
	recommendedAdministradora: "CANOPUS",
	// Raia máxima alcançada na conversa antes do lead existir (web flow).
	maxStageReached: "qualificado",
};

function makeChatReq(body: unknown): NextRequest {
	const req = new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	});
	return req;
}

function makeLeadsReq(body: unknown): NextRequest {
	return new Request("http://localhost/api/leads", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	}) as unknown as NextRequest;
}

async function postChatAction(
	conversationId: string,
	action: Record<string, unknown>,
	label: string,
): Promise<void> {
	const res = await POST(
		makeChatReq({
			conversationId,
			action,
			messages: [{ role: "user", parts: [{ type: "text", text: label }] }],
		}),
	);
	expect(res.status).toBe(200);
	// Drena o stream — o execute callback só roda até o fim quando o consumidor lê.
	await res.text();
}

async function cleanup(convId: string): Promise<void> {
	const ls = await db.select({ id: leads.id }).from(leads).where(eq(leads.conversationId, convId));
	const leadIds = ls.map((l) => l.id);
	if (leadIds.length > 0) {
		await db.delete(leadEvents).where(inArray(leadEvents.leadId, leadIds));
	}
	await db.delete(beviProposals).where(eq(beviProposals.conversationId, convId));
	const msgs = await db
		.select({ id: messagesTable.id })
		.from(messagesTable)
		.where(eq(messagesTable.conversationId, convId));
	const ids = msgs.map((m) => m.id);
	if (ids.length > 0) {
		await db.delete(artifactsTable).where(inArray(artifactsTable.messageId, ids));
	}
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describe.runIf(run)("FIX-48 — fechamento web vincula o leadId e avança a raia", () => {
	let convId: string;

	beforeEach(() => {
		__setProposalGatewayForTests(new MockProposalGateway());
	});
	afterEach(async () => {
		__setProposalGatewayForTests(null);
		if (convId) await cleanup(convId);
	});

	it("contract-submit: proposta nasce com leadId E a raia vai qualificado→proposta_enviada (system)", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: CLOSED_META })
			.returning();
		convId = conv.id;

		// Lead já existe em 'qualificado' (no web real o gate identify cria o lead
		// e o qualify avança a raia ANTES do passo 5).
		const [lead] = await db
			.insert(leads)
			.values({ conversationId: convId, name: "Kairo", phone: "62999990000", stage: "qualificado" })
			.returning();

		await postChatAction(
			convId,
			{ kind: "contract-submit", cpf: "39053344705", celular: "62999990000", lgpd: true },
			"Enviei meus dados pra contratar",
		);

		// Proposta criada e VINCULADA ao lead.
		const props = await db
			.select()
			.from(beviProposals)
			.where(eq(beviProposals.conversationId, convId));
		expect(props, "o fechamento web deveria ter criado a proposta Bevi").toHaveLength(1);
		expect(
			props[0].leadId,
			"a proposta nasceu ÓRFÃ (leadId null) — o route não resolveu/injetou o leadId no fechamento web (FIX-48)",
		).toBe(lead.id);

		// Raia AVANÇOU — o sintoma do bug é exatamente ela travada em 'qualificado'.
		const after = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) });
		expect(
			after?.stage,
			"a raia ficou presa em 'qualificado' — a transição qualificado→proposta_enviada nunca rodou porque createBeviProposal recebeu leadId undefined (FIX-48)",
		).toBe("proposta_enviada");

		// Evento de transição registrado como system.
		const events = await db
			.select()
			.from(leadEvents)
			.where(eq(leadEvents.leadId, lead.id))
			.orderBy(asc(leadEvents.createdAt));
		const transition = events.find(
			(e) => e.fromStage === "qualificado" && e.toStage === "proposta_enviada",
		);
		expect(transition, "faltou o lead_event qualificado→proposta_enviada").toBeTruthy();
		expect(transition?.actorType).toBe("system");
	});
});

describe.runIf(run)("FIX-48 — resgate retroativo: POST /api/leads religa a proposta órfã", () => {
	let convId: string;

	beforeEach(() => {
		__setProposalGatewayForTests(new MockProposalGateway());
	});
	afterEach(async () => {
		__setProposalGatewayForTests(null);
		if (convId) await cleanup(convId);
	});

	it("proposta órfã (leadId null) + criação do lead → proposta religada e raia em proposta_enviada", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ contactName: "Helena", channel: "web", metadata: CLOSED_META })
			.returning();
		convId = conv.id;

		// Proposta nasce ÓRFÃ (cenário corrida web: proposta antes do lead).
		const orphan = await createBeviProposal(
			convId,
			{ proposalId: "prop-orphan-1", proposalStatus: "simulacao", creditValue: 46000 },
			null,
		);
		expect(orphan.leadId).toBeNull();

		// Lead criado DEPOIS (captura nome/telefone) — é aqui que o resgate tem que acontecer.
		const res = await POST_LEADS(
			makeLeadsReq({ conversationId: convId, name: "Helena", phone: "62988887777" }),
		);
		expect(res.status).toBe(200);
		const { leadId } = (await res.json()) as { leadId: string };

		// Proposta religada ao lead recém-criado.
		const reproposal = await db.query.beviProposals.findFirst({
			where: eq(beviProposals.id, orphan.id),
		});
		expect(
			reproposal?.leadId,
			"a proposta órfã NÃO foi religada ao lead no POST /api/leads — o desfecho (mesa→boleto→efetivada) nunca chega ao funil (FIX-48)",
		).toBe(leadId);

		// Raia avançou pra proposta_enviada.
		const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
		expect(
			lead?.stage,
			"o lead recém-criado deveria refletir a proposta já existente (proposta_enviada), não ficar para trás",
		).toBe("proposta_enviada");

		// Não pode haver proposta órfã restante nesta conversa.
		const stillOrphan = await db
			.select()
			.from(beviProposals)
			.where(and(eq(beviProposals.conversationId, convId), isNull(beviProposals.leadId)));
		expect(stillOrphan).toHaveLength(0);
	});
});
