/**
 * FIX-316 (rodada 10, onda 4 — veredito Fable, achado A1) — o FIX-251 já
 * re-ancorava `meta.recommendedOffer`/`recommendedAdministradora` quando a
 * administradora anunciada no fechamento divergia do snapshot — mas o
 * PAYLOAD do artifact `contract_form` (o que o usuário efetivamente vê e
 * preenche no formulário) continuava com `input.administradora` cru do
 * modelo. Achado ao vivo (dossiê Mario): form exibia "Canopus" (o texto que
 * o usuário pediu) enquanto a proposta final (`real_offer`) fechava com
 * "ITAÚ" (a âncora resolvida) — o cliente preenchia um pré-cadastro pra uma
 * administradora e recebia reserva de outra.
 *
 * Este teste confirma que o payload REAL do artifact `contract_form`
 * (não só o `meta`) mostra sempre a administradora ANCORADA, nunca o texto
 * livre do modelo.
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
			userIntent: "ready_to_proceed",
			extraSignals: [],
		}),
	};
});

// O modelo anuncia "CANOPUS" no fechamento (o que o usuário pediu), mas
// CANOPUS nunca foi exibida nesta conversa — só RODOBENS/ITAU (via
// comparison_table pré-semeada abaixo). resolveOfferForAdministradora deve
// FALHAR pra "CANOPUS", e o form deve cair pro que está REALMENTE ancorado.
vi.mock("@/lib/agent/agents", () => {
	function closeContractCanopusAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						text: "Show, vamos seguir com a CANOPUS então! Pra confirmar sua reserva, só preciso de uns dados rápidos:",
					};
					yield {
						type: "tool-call",
						toolName: "present_contract_form",
						input: { administradora: "CANOPUS" },
						toolCallId: "tc-contract-1",
					};
				})(),
				finishReason: Promise.resolve("tool-calls" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}
	return {
		resolveAgent: vi.fn().mockResolvedValue(closeContractCanopusAgent()),
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

const POS_REVEAL_RODOBENS_META: ConversationMetadata = {
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
		creditValue: 90000,
		termMonths: 180,
		monthlyPayment: 1218.92,
		groupId: "g-rodobens",
	},
	qualifyAnswers: {
		creditMax: 90000,
		creditMin: 80000,
		prazoMeses: 0,
		hasLance: "no",
		lanceEmbutido: false,
	},
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

describe("FIX-316 — payload do contract_form NUNCA diverge da administradora ancorada", () => {
	let convId: string;

	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("modelo anuncia 'CANOPUS' (nunca exibida) → form mostra RODOBENS (a ancorada), não 'CANOPUS'", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Mario", metadata: POS_REVEAL_RODOBENS_META })
			.returning();
		convId = c.id;

		const [revealMsg] = await db
			.insert(messagesTable)
			.values({ conversationId: convId, role: "assistant", content: "Aqui estão as opções:", channel: "web" })
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
						creditValue: 90000,
						termMonths: 180,
						monthlyPayment: 1218.92,
					},
				],
			},
		});

		const artifacts: Array<{ type: string; payload: unknown }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "Quero fechar com a Canopus",
			isUserTurn: true,
			contactName: "Mario",
			skipLeadCollection: true,
			skipAnalyzer: true,
			userIntent: "ready_to_proceed",
			userKey: null,
		});
		for await (const ev of gen) {
			if (ev.type === "artifact") artifacts.push({ type: ev.artifactType, payload: ev.payload });
		}

		const contractForm = artifacts.find((a) => a.type === "contract_form");
		expect(contractForm, "contract_form deveria ter sido emitido").toBeTruthy();
		const payload = contractForm?.payload as Record<string, unknown>;
		expect(
			payload.administradora,
			"FIX-316: form NUNCA pode mostrar administradora não-ancorada — deve cair pra RODOBENS (a real)",
		).toBe("RODOBENS");
		expect(payload.administradora).not.toBe("CANOPUS");
	});
});
