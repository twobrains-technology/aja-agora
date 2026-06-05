/**
 * FIX-11 (Camada 1a) — Pós-fechamento amnésico: mensagens do FECHAMENTO não
 * eram persistidas (rodada 2026-06-05 tarde).
 *
 * Bug real: jornada completa até "Recebi seus documentos ✅ … sua ficha está
 * completa!", usuário pergunta "qual status da proposta?" e o agent NEGA tudo
 * ("nada chegou no nosso sistema nesse chat"), re-roda a descoberta e oferece
 * OUTRA administradora. Histórico persistido da conversa real mostrava
 * 4 mensagens `user` consecutivas SEM nenhuma `assistant` entre elas — os
 * handlers de action do route (`contract-submit`, `offer-confirm`,
 * `documents-done`, `document-upload`, `document-skip`) escrevem direto no
 * stream via `pipeClosingItems`/`writer.write` SEM `saveMessage`. No turno
 * seguinte, `loadConversationHistory` entrega o histórico mutilado ao modelo,
 * que conclui (coerente com o que recebeu) que nada aconteceu.
 *
 * CONTRATO anti-regressão: TODA mensagem assistant escrita pelos handlers de
 * action do fechamento DEVE estar em `messages` (e os artifacts do fechamento
 * vinculados via `artifacts.message_id`, como o runner já faz em
 * runner.ts:317-342).
 *
 * Mocks: fulfillment (startContract/confirmOffer/uploadContractDocument —
 * nunca toca Bevi real), contract-summary (no-op), rate-limit (allow).
 * Resto real: DB, route handler, saveMessage, createUIMessageStream.
 */

import { asc, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

// contract-submit cifra a identidade (storeIdentity) — em ambiente de teste a
// chave pode estar ausente/vazia (lição: env vazio do compose). Mesmo fallback
// do eval (tests/eval/agent-flow.eval.test.ts).
if (!process.env.IDENTITY_ENC_KEY) {
	process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
}

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

// Fulfillment mockado — o teste valida PERSISTÊNCIA do route, não a Bevi.
const fulfillmentRef = vi.hoisted(() => ({
	startContract: vi.fn(),
	confirmOffer: vi.fn(),
	uploadContractDocument: vi.fn(),
}));

vi.mock("@/lib/bevi/fulfillment", () => ({
	startContract: fulfillmentRef.startContract,
	confirmOffer: fulfillmentRef.confirmOffer,
	uploadContractDocument: fulfillmentRef.uploadContractDocument,
}));

vi.mock("@/lib/bevi/contract-summary", () => ({
	sendContractSummary: vi.fn().mockResolvedValue(undefined),
}));

// Memory adapter desligado pra evitar Letta no teste.
vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

// Import dinâmico pra garantir que mocks estejam ativos antes do load.
const { POST } = await import("./route");

function makePostReq(body: unknown): NextRequest {
	const req = new Request("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": "127.0.0.1",
		},
		body: JSON.stringify(body),
	}) as unknown as NextRequest & {
		cookies: { get: (name: string) => { value: string } | undefined };
	};
	req.cookies = { get: () => undefined };
	return req;
}

async function postAction(
	conversationId: string,
	action: Record<string, unknown>,
	label?: string,
): Promise<void> {
	const res = await POST(
		makePostReq({
			conversationId,
			action,
			messages: label ? [{ role: "user", parts: [{ type: "text", text: label }] }] : [],
		}),
	);
	expect(res.status).toBe(200);
	// Drena o stream — execute callback só termina quando consumidor leu tudo.
	const streamed = await res.text();
	if (process.env.DEBUG_CLOSING) console.log("STREAM >>>", streamed.slice(0, 2000));
}

async function assistantMessages(
	conversationId: string,
): Promise<Array<{ id: string; content: string }>> {
	const rows = await db
		.select({ id: messagesTable.id, role: messagesTable.role, content: messagesTable.content })
		.from(messagesTable)
		.where(eq(messagesTable.conversationId, conversationId))
		.orderBy(asc(messagesTable.createdAt));
	return rows.filter((r) => r.role === "assistant");
}

async function artifactsOf(messageIds: string[]): Promise<Array<{ type: string }>> {
	if (messageIds.length === 0) return [];
	return db
		.select({ type: artifactsTable.type })
		.from(artifactsTable)
		.where(inArray(artifactsTable.messageId, messageIds));
}

async function cleanup(convId: string): Promise<void> {
	const msgs = await db
		.select({ id: messagesTable.id })
		.from(messagesTable)
		.where(eq(messagesTable.conversationId, convId));
	const ids = msgs.map((m) => m.id);
	if (ids.length > 0) {
		await db.delete(artifactsTable).where(inArray(artifactsTable.messageId, ids));
	}
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

const CLOSED_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	qualifyAnswers: { creditMax: 46000, prazoMeses: 8 },
	revealCompleted: true,
	recommendedAdministradora: "CANOPUS",
};

const REAL_OFFER = {
	administradora: "CANOPUS",
	grupo: "4400",
	category: "auto",
	creditValue: 46000,
	monthlyPayment: 469.95,
};

describe("FIX-11 — handlers do fechamento persistem a mensagem assistant", () => {
	let convId: string;

	beforeEach(async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: CLOSED_META })
			.returning();
		convId = c.id;
		fulfillmentRef.startContract.mockReset();
		fulfillmentRef.confirmOffer.mockReset();
		fulfillmentRef.uploadContractDocument.mockReset();
	});

	afterEach(async () => {
		await cleanup(convId);
	});

	it("documents-done: 'Recebi seus documentos ✅' fica no histórico (era a mensagem que sumia no bug real)", async () => {
		await postAction(
			convId,
			{ kind: "documents-done", sentSlots: ["identidade_frente", "identidade_verso"] },
			"Enviei meus documentos",
		);

		const assistants = await assistantMessages(convId);
		expect(
			assistants.length,
			"handler documents-done escreveu no stream mas NÃO persistiu nenhuma assistant message — " +
				"é exatamente o histórico mutilado que induziu o agent a negar o fechamento (FIX-11)",
		).toBeGreaterThanOrEqual(1);
		expect(assistants.map((m) => m.content).join("\n")).toMatch(/Recebi seus documentos/);
	});

	it("offer-confirm: reforços + 'Parabéns!' persistidos + artifacts do fechamento vinculados à message", async () => {
		fulfillmentRef.confirmOffer.mockResolvedValue({
			proposalId: "prop-test-123",
			administradora: "CANOPUS",
			consortiumProposalLink: "https://bevi.example/sign/abc",
			documentsLinkPersonal: "https://bevi.example/docs/abc",
			documentsLinkAddress: "https://bevi.example/docs/abc/end",
		});

		await postAction(convId, { kind: "offer-confirm" }, "Confirmo essa carta");

		const assistants = await assistantMessages(convId);
		const allText = assistants.map((m) => m.content).join("\n");
		expect(
			assistants.length,
			"offer-confirm (pipeClosingItems) não persistiu nada — o 'Parabéns!' do docx virou ghost",
		).toBeGreaterThanOrEqual(1);
		expect(allText).toMatch(/Parab[ée]ns/);
		expect(allText).toMatch(/CANOPUS/);

		const arts = await artifactsOf(assistants.map((m) => m.id));
		const types = arts.map((a) => a.type);
		expect(types, "artifacts do fechamento precisam ficar vinculados à message").toContain(
			"signature_handoff",
		);
		expect(types).toContain("document_upload");
	});

	it("contract-submit (sucesso): 'Confirmei com a CANOPUS…' + artifact real_offer persistidos", async () => {
		fulfillmentRef.startContract.mockResolvedValue({
			proposalId: "prop-test-123",
			offer: REAL_OFFER,
			noOffer: false,
		});

		await postAction(
			convId,
			{ kind: "contract-submit", cpf: "39053344705", celular: "62999990000", lgpd: true },
			"Enviei meus dados pra contratar",
		);

		const assistants = await assistantMessages(convId);
		const allText = assistants.map((m) => m.content).join("\n");
		expect(assistants.length).toBeGreaterThanOrEqual(1);
		expect(allText).toMatch(/Confirmei com a CANOPUS/);

		const arts = await artifactsOf(assistants.map((m) => m.id));
		expect(arts.map((a) => a.type)).toContain("real_offer");
	});

	it("contract-submit (noOffer): 'Não encontrei uma carta…' persistido", async () => {
		fulfillmentRef.startContract.mockResolvedValue({
			proposalId: "prop-test-456",
			offer: null,
			noOffer: true,
		});

		await postAction(
			convId,
			{ kind: "contract-submit", cpf: "39053344705", celular: "62999990000", lgpd: true },
			"Enviei meus dados pra contratar",
		);

		const assistants = await assistantMessages(convId);
		expect(assistants.length).toBeGreaterThanOrEqual(1);
		expect(assistants.map((m) => m.content).join("\n")).toMatch(/N[ãa]o encontrei uma carta/);
	});

	it("document-skip: confirmação do pulo persistida", async () => {
		await postAction(convId, { kind: "document-skip" }, "Enviar depois");

		const assistants = await assistantMessages(convId);
		expect(assistants.length).toBeGreaterThanOrEqual(1);
		expect(assistants.map((m) => m.content).join("\n")).toMatch(
			/proposta j[áa] est[áa] registrada/,
		);
	});
});

describe("FIX-12 — defesa em profundidade: contract-submit pré-reveal NÃO cria proposta", () => {
	let convId: string;

	beforeEach(async () => {
		// Fim do passo 2: qualify completo, NENHUM reveal — o estado exato em
		// que o bug real criou proposta na Bevi sem o usuário ver UMA opção.
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				metadata: {
					currentPersona: "moto",
					currentCategory: "moto",
					expertiseLevel: "neutro",
					experiencePrev: "first",
					qualifyConsented: true,
					qualifyAnswers: { creditMax: 40000, monthlyBudget: 800, prazoMeses: 8, hasLance: "no" },
				} satisfies ConversationMetadata,
			})
			.returning();
		convId = c.id;
		fulfillmentRef.startContract.mockReset();
	});

	afterEach(async () => {
		await cleanup(convId);
	});

	it("sem revealCompleted: startContract NUNCA é chamado (proposta real + bureau a um clique de distância)", async () => {
		await postAction(
			convId,
			{ kind: "contract-submit", cpf: "39053344705", celular: "62999990000", lgpd: true },
			"Continuar com segurança",
		);

		expect(
			fulfillmentRef.startContract,
			"contract-submit pré-reveal criou proposta REAL na Bevi — a defesa do route (FIX-12) tem " +
				"que bloquear: decisão crítica não pode ficar a um tool-call/POST de distância sem o " +
				"servidor validar a ordem da jornada (identify → busca → reveal → decisão → passo 5)",
		).not.toHaveBeenCalled();
	});

	it("recusa é comunicada e PERSISTIDA (não vira ghost no histórico — regra do FIX-11)", async () => {
		await postAction(
			convId,
			{ kind: "contract-submit", cpf: "39053344705", celular: "62999990000", lgpd: true },
			"Continuar com segurança",
		);

		const assistants = await assistantMessages(convId);
		expect(assistants.length).toBeGreaterThanOrEqual(1);
	});

	it("com revealCompleted: startContract roda normal (fechamento legítimo não regrediu)", async () => {
		await db
			.update(conversations)
			.set({
				metadata: {
					...CLOSED_META,
				},
			})
			.where(eq(conversations.id, convId));
		fulfillmentRef.startContract.mockResolvedValue({
			proposalId: "prop-ok",
			offer: REAL_OFFER,
			noOffer: false,
		});

		await postAction(
			convId,
			{ kind: "contract-submit", cpf: "39053344705", celular: "62999990000", lgpd: true },
			"Continuar com segurança",
		);

		expect(fulfillmentRef.startContract).toHaveBeenCalledTimes(1);
	});
});
