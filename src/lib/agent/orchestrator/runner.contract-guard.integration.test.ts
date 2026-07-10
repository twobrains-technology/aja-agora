/**
 * FIX-12 (Camada 1a) — Fechamento SEQUESTROU a descoberta (rodada 2026-06-05
 * tarde, prints 27/28/31/32).
 *
 * Bug real: no fim da qualificação (momento do gate identify, D1), o modelo
 * chamou `present_contract_form` — o formulário de CONTRATAÇÃO do passo 5 —
 * no lugar de deixar o gate identify do servidor agir. Submit → proposta REAL
 * criada na Bevi (CPF + consulta de bureau) SEM o usuário ter visto UMA opção.
 * Passos 3 e 4 da jornada canônica (reveal + decisão) nunca aconteceram.
 *
 * Root cause: `present_contract_form` é tool do MODELO; a descrição/prompt
 * dizem "só pós-decisão", mas era instrução, não defesa — NENHUM guard
 * server-side impedia o contract_form pré-reveal.
 *
 * CONTRATO anti-regressão (guard `isPrematureContract` no runner):
 *  - pré-reveal (meta.revealCompleted !== true): contract_form SUPRIMIDO e,
 *    com o turno sem artifact, a avaliação de gates do runner reconduz ao
 *    gate identify (o que DEVIA ter acontecido na conversa real);
 *  - pós-reveal: contract_form PASSA (fluxo legítimo do passo 5 intacto).
 *
 * Mocks: resolveAgent (stub emitindo present_contract_form), analyzeTurn
 * (intent determinístico), memory bridge (sem Letta). Resto real: DB,
 * orchestrator runTurn, runner com guards, qualify-state nextGate.
 */

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// Agent stub: reproduz a trajetória do bug — narrativa do identify + tool-call
// de present_contract_form (a tool ERRADA pra esse momento da jornada).
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						text: "Boa! Pra eu buscar as opções reais, o sistema precisa da sua identidade:",
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

const { runTurn } = await import("@/lib/agent/orchestrator");

/** Fim do passo 2 da jornada: qualify completo, identidade AINDA não coletada
 * — exatamente o estado da conversa real quando o bug disparou. nextGate
 * deste meta = "identify" (cf. agent-trajectory: funil completo → identify). */
const END_OF_QUALIFY_META: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "moto",
	currentCategory: "moto",
	expertiseLevel: "neutro",
	experiencePrev: "first",
	qualifyConsented: true,
	qualifyAnswers: {
		creditMin: 35_000,
		creditMax: 40_000,
		monthlyBudget: 800,
		prazoMeses: 8,
		hasLance: "no",
		lanceEmbutido: false,
	},
};

async function drainTurn(conversationId: string): Promise<{
	artifactTypes: string[];
	gates: string[];
	toolCalls: string[];
}> {
	const artifactTypes: string[] = [];
	const gates: string[] = [];
	const toolCalls: string[] = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText: "Sem lance embutido, pode buscar as opções!",
		isUserTurn: true,
		contactName: "Kairo",
		skipLeadCollection: true,
		userKey: null,
	});
	for await (const ev of gen) {
		if (ev.type === "artifact") artifactTypes.push(ev.artifactType);
		if (ev.type === "gate") gates.push(ev.gate);
		if (ev.type === "tool-call") toolCalls.push(ev.toolName);
	}
	return { artifactTypes, gates, toolCalls };
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

describe("FIX-12 — guard server-side: contract_form pré-reveal", () => {
	let convId: string;

	afterEach(async () => {
		await cleanup(convId);
	});

	it("pré-reveal: contract_form SUPRIMIDO e gate identify emitido no lugar (a jornada certa)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: END_OF_QUALIFY_META })
			.returning();
		convId = c.id;

		const { artifactTypes, gates, toolCalls } = await drainTurn(convId);

		// O modelo TENTOU chamar a tool (trajetória do bug reproduzida)…
		expect(toolCalls).toContain("present_contract_form");
		// …mas o servidor NÃO pode deixar o form de contratação aparecer antes
		// do usuário ter visto qualquer opção (criaria proposta REAL na Bevi).
		expect(
			artifactTypes,
			"contract_form pré-reveal tem que ser suprimido pelo guard do runner (FIX-12) — " +
				"sem isso o fechamento sequestra a descoberta e cria proposta real sem reveal",
		).not.toContain("contract_form");
		// Com o turno sem artifact, a avaliação de gates reconduz ao identify —
		// o card correto (kind: identity) pra esse momento da jornada (D1).
		expect(gates).toContain("identify");
	});

	it("pós-reveal: contract_form PASSA (passo 5 legítimo não regrediu)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				metadata: {
					...END_OF_QUALIFY_META,
					identityCollected: true,
					searchDispatched: true,
					revealCompleted: true,
					decisionDispatched: true,
					recommendedAdministradora: "CANOPUS",
				},
			})
			.returning();
		convId = c.id;

		const { artifactTypes } = await drainTurn(convId);

		expect(
			artifactTypes,
			"pós-reveal o contract_form é o fluxo LEGÍTIMO do passo 5 — o guard não pode bloquear",
		).toContain("contract_form");
	});
});
