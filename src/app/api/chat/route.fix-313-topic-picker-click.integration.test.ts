// FIX-313 (rodada 10, onda 4 — achado na Rodada A.3 de verificação): clique
// num chip do `topic_picker` (menu de dúvidas pós-experience, "o que é
// lance?"/"como funciona o sorteio?"/etc.) reusa `kind: "interest"` com
// `administradora: "topic-picker"` (topic-picker.tsx). SEM tratamento
// dedicado, caía no handler genérico de "Tenho interesse" (route.ts) —
// disparando decisionDispatched + present_contract_form + WhatsApp opt-in NO
// MEIO de uma pergunta de dúvida. Achado real (dossiê Madalena, Rodada A.3):
// "Posso te mostrar a opção que eu recomendo?" repetido 3-4x colado no mesmo
// balão, contract_form disparando cedo demais.
//
// Este teste é de INTEGRAÇÃO (mesmo padrão do FIX-311): sobe o handler
// POST /api/chat REAL contra o DB real, com um agente MOCADO que só produz
// texto — se o fecho ainda assim dispara, é comportamento server-side
// determinístico (não depende do LLM).

import { eq, inArray } from "drizzle-orm";
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

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						text: "Lance é quando você oferece um valor a mais pra acelerar sua contemplação.",
					};
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

// Ponto do funil imediatamente pós-experience="first", topic_picker JÁ
// emitido (mesmo estado que index.ts persiste antes do usuário clicar um
// chip) — reco-consent já disparado no mesmo turno (padrão real observado).
const POS_TOPIC_PICKER_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	desireAsked: true,
	identityCollected: true,
	qualifyAnswers: { creditMin: 76_500, creditMax: 90_000 },
	revealCompleted: true,
	searchDispatched: true,
	experiencePrev: "first",
	topicPickerDispatched: true,
	recoConsentDispatched: true,
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

async function metadataOf(convId: string): Promise<ConversationMetadata | undefined> {
	const row = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
	return row?.metadata as ConversationMetadata | undefined;
}

describeIfDb(
	"FIX-313 — clique no chip do topic_picker responde a dúvida, NÃO avança pro fecho",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it("clique em 'o que é lance?' NÃO dispara decisionDispatched/contract_form/scarcity", async () => {
			const [c] = await db
				.insert(conversations)
				.values({ contactName: "Kairo", channel: "web", metadata: POS_TOPIC_PICKER_META })
				.returning();
			convId = c.id;

			const res = await POST(
				makeReq({
					conversationId: convId,
					messages: [{ role: "user", parts: [{ type: "text", text: "o que é lance?" }] }],
					action: { kind: "interest", administradora: "topic-picker", label: "o que é lance?" },
				}),
			);
			const text = await res.text();

			expect(text).not.toContain('"type":"scarcity"');
			expect(text).not.toContain('"type":"decision_prompt"');
			expect(text).not.toContain('"type":"contract_form"');
			expect(text).not.toContain('"type":"whatsapp_optin"');

			const meta = await metadataOf(convId);
			expect(meta?.decisionDispatched).not.toBe(true);
		});

		it("clique em 'o que é lance?' não repete a pergunta de reco-consent (já feita, idempotente)", async () => {
			const [c] = await db
				.insert(conversations)
				.values({ contactName: "Kairo", channel: "web", metadata: POS_TOPIC_PICKER_META })
				.returning();
			convId = c.id;

			const res = await POST(
				makeReq({
					conversationId: convId,
					messages: [{ role: "user", parts: [{ type: "text", text: "o que é lance?" }] }],
					action: { kind: "interest", administradora: "topic-picker", label: "o que é lance?" },
				}),
			);
			const text = await res.text();

			const occurrences = text.split("Posso te mostrar a opção que eu recomendo?").length - 1;
			expect(occurrences).toBeLessThanOrEqual(1);
		});

		it("clique em 'voltar' também NÃO avança pro fecho", async () => {
			const [c] = await db
				.insert(conversations)
				.values({ contactName: "Kairo", channel: "web", metadata: POS_TOPIC_PICKER_META })
				.returning();
			convId = c.id;

			const res = await POST(
				makeReq({
					conversationId: convId,
					messages: [{ role: "user", parts: [{ type: "text", text: "voltar" }] }],
					action: { kind: "interest", administradora: "topic-picker", label: "voltar" },
				}),
			);
			const text = await res.text();

			expect(text).not.toContain('"type":"contract_form"');
			const meta = await metadataOf(convId);
			expect(meta?.decisionDispatched).not.toBe(true);
		});

		it("REGRESSÃO — 'Tenho interesse' com administradora REAL continua indo pro fecho (decisionDispatched=true); a cerimônia scarcity→decision_prompt em si é coberta por FIX-311", async () => {
			const [c] = await db
				.insert(conversations)
				.values({ contactName: "Kairo", channel: "web", metadata: POS_TOPIC_PICKER_META })
				.returning();
			convId = c.id;

			await POST(
				makeReq({
					conversationId: convId,
					messages: [{ role: "user", parts: [{ type: "text", text: "Tenho interesse!" }] }],
					action: { kind: "interest", administradora: "CANOPUS", label: "Tenho interesse!" },
				}),
			);

			const meta = await metadataOf(convId);
			expect(meta?.decisionDispatched).toBe(true);
		});
	},
);
