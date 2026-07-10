/**
 * FIX-265 (menor #2, veredito Fable r5, N6) — snapshot ancorou em what-if NÃO
 * pedido: pedido ~100k (creditMax), a LLM simulou um valor especulativo bem
 * maior (161.258 — "e se você aumentasse?") sem o usuário ter citado esse
 * valor nem o nome de uma administradora já exibida com ele. O runner (FIX-6,
 * runner.ts) aceitava QUALQUER simulation_result pós-reveal como a nova âncora
 * — o embedded_bid e o dial passavam a falar da carta de 161.258 que ninguém
 * pediu.
 *
 * Correção: só re-ancora sem resolução por nome/valor já exibido (`mentioned`
 * null) quando o valor da simulação está EXPLICITAMENTE respaldado pelo texto
 * do usuário (isCreditValueMentioned, choose-offer.ts). Sem respaldo, o
 * snapshot anterior é mantido — a simulação aparece como card informativo,
 * mas não vira a oferta confirmada.
 *
 * Reusa o mesmo harness/mocks de runner.ancora-fechamento.integration.test.ts.
 */

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>(
		"@/lib/agent/turn-analyzer",
	);
	return {
		...actual,
		analyzeTurn: vi.fn().mockResolvedValue({
			reasoning: "test",
			detectedCategory: null,
			detectedSubTopic: null,
			isExplicitSwitch: false,
			expertiseLevel: "neutro",
			experiencePrev: null,
			creditMin: null,
			creditMax: null,
			prazoMeses: null,
			hasLance: null,
			userIntent: "providing_info",
			extraSignals: [],
		}),
	};
});

vi.mock("@/lib/agent/agents", () => {
	function whatIfExploratorioAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						text: "Se aumentasse um pouco, a condição fica assim:",
					};
					yield {
						type: "tool-call",
						toolName: "simulate_quota",
						input: { groupId: "g-rodobens", creditValue: 161258 },
						toolCallId: "tc-sim-whatif",
					};
					yield {
						type: "tool-result",
						toolName: "simulate_quota",
						output: {
							creditValue: 161258,
							monthlyPayment: 2984.38,
							adminFee: 8000,
							reserveFund: 4000,
							insurance: 500,
							totalCost: 596876,
							termMonths: 200,
							effectiveRate: 1.2,
						},
					};
					yield {
						type: "tool-call",
						toolName: "present_simulation_result",
						input: {
							groupId: "g-rodobens",
							administradora: "RODOBENS",
							category: "auto",
							creditValue: 161258,
							termMonths: 200,
							monthlyPayment: 2984.38,
						},
						toolCallId: "tc-present-sim",
					};
				})(),
				finishReason: Promise.resolve("tool-calls" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}

	return {
		resolveAgent: vi.fn().mockImplementation(async () => whatIfExploratorioAgent()),
		invalidateAgentCache: vi.fn(),
	};
});

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { runTurn } = await import("@/lib/agent/orchestrator");

const POS_REVEAL_META: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	decisionDispatched: true,
	recommendedAdministradora: "RODOBENS",
	recommendedOffer: {
		administradora: "RODOBENS",
		category: "auto",
		creditValue: 100000,
		termMonths: 180,
		monthlyPayment: 1354.36,
		groupId: "g-rodobens",
	},
	qualifyAnswers: {
		creditMax: 100000,
		creditMin: 90000,
		prazoMeses: 0,
		hasLance: "no",
		lanceEmbutido: false,
	},
};

async function driveTurn(conversationId: string, userText: string): Promise<{ artifactTypes: string[] }> {
	const artifactTypes: string[] = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Dora",
		skipLeadCollection: true,
		skipAnalyzer: true,
		userIntent: "providing_info",
		userKey: null,
	});
	for await (const ev of gen) {
		if (ev.type === "artifact") artifactTypes.push(ev.artifactType);
	}
	return { artifactTypes };
}

async function loadMeta(conversationId: string): Promise<ConversationMetadata> {
	const row = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
	return (row?.metadata ?? {}) as ConversationMetadata;
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

describe("FIX-265 — what-if EXPLORATÓRIO (valor que ninguém pediu) NÃO vira a âncora do fechamento/dial", () => {
	let convId: string;

	afterEach(async () => {
		await cleanup(convId);
	});

	it("pedido 100k + what-if especulativo 161.258 (sem nome/valor citado) → snapshot mantido em 100.000", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Dora", metadata: POS_REVEAL_META })
			.returning();
		convId = c.id;

		const [revealMsg] = await db
			.insert(messagesTable)
			.values({
				conversationId: convId,
				role: "assistant",
				content: "Aqui está a sua recomendação:",
				channel: "web",
			})
			.returning();
		await db.insert(artifactsTable).values({
			messageId: revealMsg.id,
			type: "comparison_table",
			payload: {
				groups: [
					{
						id: "g-rodobens",
						groupId: "g-rodobens",
						administradora: "RODOBENS",
						creditValue: 100000,
						termMonths: 180,
						monthlyPayment: 1354.36,
					},
				],
			},
		});

		const { artifactTypes } = await driveTurn(
			convId,
			"E se eu aumentasse um pouco o valor, será que fica melhor?",
		);
		expect(artifactTypes).toContain("simulation_result");

		const afterWhatIf = await loadMeta(convId);
		expect(
			afterWhatIf.recommendedOffer?.creditValue,
			"FIX-265: what-if especulativo (161.258) não pedido pelo usuário NUNCA pode virar a âncora — o snapshot fica no pedido real (100.000)",
		).toBe(100000);
		expect(afterWhatIf.recommendedAdministradora).toBe("RODOBENS");
	});
});
