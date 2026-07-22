/**
 * Camada 1 — erro do startContract ENGOLIDO sem log (dev real 2026-06-11).
 *
 * Bug real: no dev (PROPOSAL_GATEWAY=bevi) o submit do contract_form falhou e
 * o usuário viu "Tive um problema ao falar com a administradora agora" — mas
 * NADA foi logado: o catch do handler contract-submit (route.ts:513) traduzia
 * o erro pra mensagem amigável e descartava o `err`. Diagnóstico em produção
 * impossível (CloudWatch vazio). Mesma lição do empty-env-compose: tool errors
 * SEMPRE logados.
 *
 * CONTRATO anti-regressão: quando startContract rejeita, o handler DEVE
 * console.error com tag [contract-submit] + o erro original, ANTES de
 * responder a mensagem amigável (que continua sendo enviada — UX preservada).
 *
 * Mocks: fulfillment (startContract — nunca toca Bevi real), rate-limit,
 * memory. Resto real: DB, route handler, saveMessage.
 */

import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

if (!process.env.IDENTITY_ENC_KEY) {
	process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
}

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

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

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import("./route");

function makePostReq(body: unknown): NextRequest {
	const req = new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": "127.0.0.1",
		},
		body: JSON.stringify(body),
	});
	return req;
}

const CLOSED_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	qualifyAnswers: { creditMax: 46000, prazoMeses: 8 },
	revealCompleted: true,
	recommendedAdministradora: "ITAU",
	// FIX-244: guard exige que present_contract_form já tenha aparecido.
	contractFormDispatched: true,
};

describe("contract-submit loga o erro do startContract (bug dev 2026-06-11)", () => {
	let convId: string;

	beforeEach(async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: CLOSED_META })
			.returning({ id: conversations.id });
		convId = c.id;
		fulfillmentRef.startContract.mockReset();
	});

	afterEach(async () => {
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
		vi.restoreAllMocks();
	});

	it("erro genérico da Bevi → console.error com [contract-submit] + erro original; mensagem amigável preservada", async () => {
		const beviErr = new Error("Bevi 409: CPF possui proposta em andamento");
		fulfillmentRef.startContract.mockRejectedValue(beviErr);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const res = await POST(
			makePostReq({
				conversationId: convId,
				action: {
					kind: "contract-submit",
					cpf: "02874137138",
					celular: "62992496793",
					lgpd: true,
				},
				messages: [{ role: "user", parts: [{ type: "text", text: "Enviei meus dados" }] }],
			}),
		);
		expect(res.status).toBe(200);
		const streamed = await res.text();

		// UX preservada: usuário recebe a mensagem amigável.
		expect(streamed).toContain("problema ao falar com a administradora");

		// CONTRATO: o erro ORIGINAL foi logado com a tag do handler — sem isso,
		// CloudWatch fica vazio e o diagnóstico em dev/prod é impossível.
		const calls = errorSpy.mock.calls.flat();
		expect(calls.some((arg) => typeof arg === "string" && arg.includes("[contract-submit]"))).toBe(
			true,
		);
		expect(calls).toContain(beviErr);
	});
});
