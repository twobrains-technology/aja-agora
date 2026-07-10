// FIX-259 (rodada 5, veredito Fable r4, P1 #2): mesma classe de bug do FIX-247
// (rawCreditValue) — `route.ts` desestruturava só um subconjunto do retorno de
// `startContract` antes de `realOfferPresentation`, descartando o campo novo
// silenciosamente. Este teste é de INTEGRAÇÃO: mocka só o Bevi (`startContract`,
// fronteira externa) e exercita o handler REAL `contract-submit` de ponta a
// ponta, provando que `administradoraChanged`/`previousAdministradora`
// sobrevivem até o artifact persistido (o aviso de troca nunca fica morto).

import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	artifacts as artifactsTable,
	conversations,
	messages as messagesTable,
} from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

// Única fronteira mocada: a Bevi (rede externa). Cenário do veredito r4:
// confirmou ITAÚ, o catálogo do fechamento só tinha BANCO DO BRASIL na faixa.
vi.mock("@/lib/bevi/fulfillment", async () => {
	const actual = await vi.importActual<typeof import("@/lib/bevi/fulfillment")>(
		"@/lib/bevi/fulfillment",
	);
	return {
		...actual,
		startContract: vi.fn().mockResolvedValue({
			proposalId: "prop-fix-259",
			offer: {
				administradora: "BANCO DO BRASIL",
				grupo: "1716",
				category: "auto",
				creditValue: 94_707,
				monthlyPayment: 2_984.4,
				termMonths: 39,
			},
			noOffer: false,
			requestedCreditValue: 92_902,
			administradoraChanged: true,
			previousAdministradora: "ITAÚ",
		}),
	};
});

const { POST } = await import("./route");

function makeReq(body: unknown): NextRequest {
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	});
}

const CONTRACT_READY_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	decisionDispatched: true,
	contractFormDispatched: true,
	recommendedAdministradora: "ITAÚ",
	qualifyAnswers: { creditMin: 80_000, creditMax: 92_902 },
};

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

describeIfDb("FIX-259 — aviso de troca de administradora fiado ponta-a-ponta (contract-submit → real_offer)", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("catálogo trocou a administradora confirmada → aviso explícito no texto E no artifact persistido", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: CONTRACT_READY_META })
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Confirmo" }] }],
				action: {
					kind: "contract-submit",
					cpf: "12345678909",
					celular: "11987654321",
					lgpd: true,
				},
			}),
		);
		const text = await res.text();

		// O aviso de troca depende de administradoraChanged/previousAdministradora
		// sobreviverem ao destructuring de route.ts — sem isso, "Confirmei com a
		// BANCO DO BRASIL" sai liso, sem explicar a troca (LEI: nunca em silêncio).
		expect(text).toMatch(/ITAÚ/);
		expect(text).toMatch(/n[ãa]o tem grupo dispon[íi]vel/i);

		const rows = await db
			.select({ id: messagesTable.id })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		const persisted = await db
			.select()
			.from(artifactsTable)
			.where(
				inArray(
					artifactsTable.messageId,
					rows.map((r) => r.id),
				),
			);
		const realOffer = persisted.find((a) => a.type === "real_offer");
		expect(realOffer).toBeDefined();
		expect(realOffer?.payload.administradora).toBe("BANCO DO BRASIL");
	});
});
