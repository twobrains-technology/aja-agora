/**
 * FIX-263 (P1, veredito Fable r5, seam PARCIAL, 2026-07-10) — anti-refazer em
 * CÓDIGO. O achado ao vivo: sob contestação, o agente negou a proposta
 * RODOBENS já registrada, afirmou falsamente que a ITAÚ estava registrada
 * (sem `check_proposal_status`) e reabriu o `contract_form` da ITAÚ — a 1
 * clique de criar uma 2ª proposta REAL (CPF + consulta de bureau) na MESMA
 * conversa. O anti-refazer era regra-no-prompt e falhou 2× ao vivo.
 *
 * Contrato anti-regressão: `contract-submit` (route.ts) NUNCA pode chamar
 * `startContract` de novo quando já existe uma proposta REGISTRADA
 * (`bevi_proposals`) pra uma administradora DIFERENTE da que o fechamento em
 * curso está pedindo — bloqueia ANTES do gateway, com mensagem determinística
 * que nunca nega a proposta existente e nunca inventa estado (nudge pro
 * `check_proposal_status`).
 *
 * Mocks: fulfillment (startContract — spy, nunca toca Bevi real), rate-limit,
 * memory. Resto real: DB (bevi_proposals via proposal-repo), route handler.
 */

import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	artifacts as artifactsTable,
	beviProposals,
	conversations,
	messages as messagesTable,
} from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { createBeviProposal } from "@/lib/bevi/proposal-repo";

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
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	});
}

// Fechamento contestado: usuário trocou de marca por texto — meta já reflete
// a NOVA administradora (ITAÚ), mas a conversa JÁ TEM uma proposta REAL
// registrada pra outra (RODOBENS) — o cenário exato do veredito.
const SWITCHED_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	qualifyAnswers: { creditMax: 92902, prazoMeses: 200 },
	revealCompleted: true,
	recommendedAdministradora: "ITAÚ",
	contractFormDispatched: true,
};

const SAME_ADMIN_META: ConversationMetadata = {
	...SWITCHED_META,
	recommendedAdministradora: "RODOBENS",
};

describe("contract-submit — anti-refazer bloqueia 2ª proposta de administradora diferente (FIX-263)", () => {
	let convId: string;

	afterEach(async () => {
		if (!convId) return;
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
		await db.delete(conversations).where(eq(conversations.id, convId));
		vi.restoreAllMocks();
	});

	it("proposta RODOBENS já registrada + fechamento pedindo ITAÚ → bloqueia, NUNCA cria 2ª proposta real", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: SWITCHED_META })
			.returning({ id: conversations.id });
		convId = c.id;
		await createBeviProposal(convId, {
			proposalId: "prop-rodobens-1",
			administradora: "RODOBENS",
			creditValue: 90000,
			proposalStatus: "simulacao",
		});
		fulfillmentRef.startContract.mockReset();

		const res = await POST(
			makePostReq({
				conversationId: convId,
				action: { kind: "contract-submit", cpf: "02874137138", celular: "62992496793", lgpd: true },
				messages: [{ role: "user", parts: [{ type: "text", text: "Confirma a ITAÚ pra mim" }] }],
			}),
		);
		expect(res.status).toBe(200);
		const streamed = await res.text();

		// O gateway NUNCA foi chamado — nenhuma 2ª proposta real (CPF + bureau).
		expect(
			fulfillmentRef.startContract,
			"startContract NÃO pode rodar quando já existe proposta registrada de outra administradora",
		).not.toHaveBeenCalled();

		// Só a proposta original (RODOBENS) segue no banco — nenhuma nova linha.
		const props = await db
			.select()
			.from(beviProposals)
			.where(eq(beviProposals.conversationId, convId));
		expect(props).toHaveLength(1);
		expect(props[0].administradora).toBe("RODOBENS");

		// Mensagem determinística: nunca nega a proposta existente, nomeia a
		// administradora CERTA (RODOBENS, a registrada — não a ITAÚ pedida).
		expect(streamed).toContain("RODOBENS");
		expect(streamed).not.toMatch(/não tenho nenhuma proposta/i);
	});

	it("mesma administradora (retry legítimo, ex.: erro de rede anterior) → NÃO bloqueia, segue pro gateway", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: SAME_ADMIN_META })
			.returning({ id: conversations.id });
		convId = c.id;
		await createBeviProposal(convId, {
			proposalId: "prop-rodobens-2",
			administradora: "RODOBENS",
			creditValue: 90000,
			proposalStatus: "simulacao",
		});
		fulfillmentRef.startContract.mockReset();
		fulfillmentRef.startContract.mockResolvedValue({
			proposalId: "prop-rodobens-2",
			offer: { creditValue: 90000, monthlyPayment: 1218.92, termMonths: 180 },
			noOffer: false,
			requestedCreditValue: 92902,
			administradoraChanged: false,
			previousAdministradora: null,
		});

		const res = await POST(
			makePostReq({
				conversationId: convId,
				action: { cpf: "02874137138", celular: "62992496793", lgpd: true, kind: "contract-submit" },
				messages: [{ role: "user", parts: [{ type: "text", text: "Manda de novo, deu erro" }] }],
			}),
		);
		expect(res.status).toBe(200);
		await res.text();

		expect(fulfillmentRef.startContract).toHaveBeenCalledTimes(1);
	});

	it("sem proposta registrada ainda (1ª vez) → NÃO bloqueia, segue pro gateway normalmente", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: SWITCHED_META })
			.returning({ id: conversations.id });
		convId = c.id;
		fulfillmentRef.startContract.mockReset();
		fulfillmentRef.startContract.mockResolvedValue({
			proposalId: "prop-itau-1",
			offer: { creditValue: 92902, monthlyPayment: 2182.01, termMonths: 200 },
			noOffer: false,
			requestedCreditValue: 92902,
			administradoraChanged: false,
			previousAdministradora: null,
		});

		const res = await POST(
			makePostReq({
				conversationId: convId,
				action: { kind: "contract-submit", cpf: "02874137138", celular: "62992496793", lgpd: true },
				messages: [{ role: "user", parts: [{ type: "text", text: "Confirma pra mim" }] }],
			}),
		);
		expect(res.status).toBe(200);
		await res.text();

		expect(fulfillmentRef.startContract).toHaveBeenCalledTimes(1);
	});
});
