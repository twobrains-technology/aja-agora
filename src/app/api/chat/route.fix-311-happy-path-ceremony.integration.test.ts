// FIX-311 (r10-4, happy-path-ceremony): `scarcity`/`decision_prompt` NUNCA
// apareciam em nenhum dos 2 dossiês limpos investigados (Madalena, Mario) —
// o funil pulava direto pro fecho (contract_form) assim que o usuário
// demonstrava interesse claro. Causa-raiz: os dois fast-paths do ramo FELIZ
// (ação `interest`, route.ts:508-522; aceite do simulador, gate
// `simulator-offer="yes"`, route.ts:1125-1145) iam direto pro próximo passo
// SEM passar pela cerimônia scarcity→decision_prompt, que só existia no ramo
// de recusa/ambiguidade (`simulator-offer="no"`, route.ts:1147-1189).
//
// Este teste é de INTEGRAÇÃO (mesmo padrão do FIX-246): sobe o handler
// POST /api/chat REAL contra o DB real, com um agente MOCADO que NUNCA chama
// tool nenhuma — só produz texto. Se os cards ainda assim aparecem no
// stream, a emissão é PROVADAMENTE server-side determinística.

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

// Agente MOCADO: produz SÓ texto, NUNCA chama tool nenhuma — prova que a
// cerimônia não depende de tool-call do LLM.
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", text: "Boa, bora seguir então." };
				})(),
				finishReason: Promise.resolve("stop" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}
	return {
		resolveAgent: vi.fn().mockResolvedValue(makeAgent()),
		invalidateAgentCache: vi.fn(),
	};
});

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agent/personas-repo", () => ({
	getPersona: vi.fn().mockResolvedValue({
		id: "auto",
		role: "specialist",
		category: "auto",
		isActive: true,
		examples: [],
	}),
}));

const { POST } = await import("./route");

function makeReq(body: unknown): NextRequest {
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	});
}

/** Estado PÓS-reveal (passo 3+4 concluído) — mesmo fixture do FIX-246.
 * `recommendedOffer.groupId` ancora a emissão determinística do scarcity. */
const POS_REVEAL_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	experiencePrev: "returning",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	recommendedAdministradora: "CANOPUS",
	recommendedOffer: {
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 90_000,
		termMonths: 72,
		monthlyPayment: 812,
		groupId: "grupo-real-abc",
	},
	qualifyAnswers: { creditMin: 76_500, creditMax: 90_000, prazoMeses: 72 },
};

async function cleanup(convId: string): Promise<void> {
	const msgs = await db
		.select({ id: messagesTable.id })
		.from(messagesTable)
		.where(eq(messagesTable.conversationId, convId));
	const ids = msgs.map((m) => m.id);
	if (ids.length > 0) {
		const { inArray } = await import("drizzle-orm");
		await db.delete(artifactsTable).where(inArray(artifactsTable.messageId, ids));
	}
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

async function metadataOf(convId: string): Promise<ConversationMetadata | undefined> {
	const row = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
	return row?.metadata as ConversationMetadata | undefined;
}

describeIfDb("FIX-311 — cerimônia scarcity→decision_prompt no ramo FELIZ do funil", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("ação 'interest' (aceite direto, hoje pula pro fecho): scarcity e decision_prompt aparecem NESSA ORDEM antes do fecho", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: POS_REVEAL_META })
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Tenho interesse!" }] }],
				action: { kind: "interest", administradora: "CANOPUS", label: "Tenho interesse!" },
			}),
		);
		const text = await res.text();

		const scarcityIdx = text.indexOf('"type":"scarcity"');
		const decisionIdx = text.indexOf('"type":"decision_prompt"');
		expect(scarcityIdx).toBeGreaterThan(-1);
		expect(decisionIdx).toBeGreaterThan(-1);
		expect(scarcityIdx).toBeLessThan(decisionIdx);

		const meta = await metadataOf(convId);
		expect(meta?.decisionDispatched).toBe(true);
	});

	it("FIX-316 — reco-consent AINDA não respondido: a pergunta do gate aparece NO MÁXIMO 1x no turno de fechamento (não 3x)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: POS_REVEAL_META })
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Tenho interesse!" }] }],
				action: { kind: "interest", administradora: "CANOPUS", label: "Tenho interesse!" },
			}),
		);
		const text = await res.text();

		const occurrences = text.split("Posso te mostrar a op").length - 1;
		expect(
			occurrences,
			`achado ao vivo (Fable): a pergunta de reco-consent repetia 3x no mesmo turno de fechamento — texto: ${text}`,
		).toBeLessThanOrEqual(1);
	});

	it("gate simulator-offer='yes' (aceite do simulador, hoje só mostra o dial): scarcity e decision_prompt aparecem NESSA ORDEM no mesmo turno", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: { ...POS_REVEAL_META, simulatorOfferDispatched: false },
			})
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Bora ver!" }] }],
				action: { kind: "gate", gate: "simulator-offer", value: "yes", label: "Bora ver!" },
			}),
		);
		const text = await res.text();

		// A cerimônia vem DETERMINISTICAMENTE em seguida, no mesmo turno, em vez
		// de depender de um próximo turno de texto livre pra disparar o gate
		// "decision" (o agente mocado nunca chama tool — present_contemplation_dial
		// não é observável aqui, só o efeito server-side determinístico).
		const scarcityIdx = text.indexOf('"type":"scarcity"');
		const decisionIdx = text.indexOf('"type":"decision_prompt"');
		expect(scarcityIdx).toBeGreaterThan(-1);
		expect(decisionIdx).toBeGreaterThan(-1);
		expect(scarcityIdx).toBeLessThan(decisionIdx);

		const meta = await metadataOf(convId);
		expect(meta?.decisionDispatched).toBe(true);
	});

	it("ação 'interest' com decisionDispatched já true (cerimônia já mostrada por outro caminho): NÃO repete a cerimônia", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: { ...POS_REVEAL_META, decisionDispatched: true },
			})
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Tenho interesse!" }] }],
				action: { kind: "interest", administradora: "CANOPUS", label: "Tenho interesse!" },
			}),
		);
		const text = await res.text();

		expect(text).not.toContain('"type":"scarcity"');
		expect(text).not.toContain('"type":"decision_prompt"');
	});

	it("REGRESSÃO — gate simulator-offer='no' (ramo de recusa/ambiguidade): cerimônia continua idêntica após a extração", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: { ...POS_REVEAL_META, simulatorOfferDispatched: true },
			})
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Agora não" }] }],
				action: { kind: "gate", gate: "simulator-offer", value: "no", label: "Agora não" },
			}),
		);
		const text = await res.text();

		const scarcityIdx = text.indexOf('"type":"scarcity"');
		const decisionIdx = text.indexOf('"type":"decision_prompt"');
		expect(scarcityIdx).toBeGreaterThan(-1);
		expect(decisionIdx).toBeGreaterThan(-1);
		expect(scarcityIdx).toBeLessThan(decisionIdx);

		const meta = await metadataOf(convId);
		expect(meta?.decisionDispatched).toBe(true);
	});
});
