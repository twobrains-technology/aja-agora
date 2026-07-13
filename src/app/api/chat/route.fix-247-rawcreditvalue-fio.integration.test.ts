// FIX-247 (rodada 3, Fable r2 — gap #2 PARCIAL): o clamp de faixa funciona
// (BANCO DO BRASIL 157.845 em vez de 211k), MAS o aviso de ajuste (FIX-197)
// ficava MORTO em integração — `route.ts` desestruturava
// `const { proposalId, offer, noOffer } = await startContract(...)`,
// DESCARTANDO `requestedCreditValue` antes de `realOfferPresentation`. Os
// testes anteriores eram só de FOLHA (closing-presentation/formatter recebem
// o campo pronto) — nenhum cobria o fio inteiro, por isso passaram com o
// aviso morto. Este teste é de INTEGRAÇÃO: mocka só o Bevi (`startContract`,
// fronteira externa) e exercita o handler REAL `contract-submit` de ponta a
// ponta, provando que `rawCreditValue` sobrevive até o artifact persistido.

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

// Única fronteira mocada: a Bevi (rede externa). O cenário reproduz o achado
// ao vivo do veredito — pedido 150.000, carta real ajustada pra 157.845.
vi.mock("@/lib/bevi/fulfillment", async () => {
	const actual = await vi.importActual<typeof import("@/lib/bevi/fulfillment")>(
		"@/lib/bevi/fulfillment",
	);
	return {
		...actual,
		startContract: vi.fn().mockResolvedValue({
			proposalId: "prop-fix-247",
			offer: {
				administradora: "BANCO DO BRASIL",
				grupo: "20486",
				category: "auto",
				creditValue: 157_845,
				monthlyPayment: 4_974,
				termMonths: 39,
				avgBidValue: 134_761.48,
			},
			noOffer: false,
			requestedCreditValue: 150_000,
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
	qualifyAnswers: { creditMin: 127_500, creditMax: 150_000 },
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

describeIfDb("FIX-247 — rawCreditValue fiado ponta-a-ponta (contract-submit → real_offer)", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("carta real diverge do valor pedido → real_offer.rawCreditValue presente no stream E no banco", async () => {
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

		// O aviso de ajuste depende do rawCreditValue chegar no artifact — prova
		// que o campo sobreviveu ao destructuring de route.ts.
		expect(text).toContain('"rawCreditValue":150000');

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
		expect(realOffer?.payload.rawCreditValue).toBe(150_000);
		expect(realOffer?.payload.creditValue).toBe(157_845);
	});
});
