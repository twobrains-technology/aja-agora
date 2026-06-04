/**
 * BUG-LEAD-HISTORY-INCOMPLETE — canal WEB (espelho do teste WhatsApp).
 *
 * O sintoma original do bug foi no WhatsApp, mas o gap #1 (artifacts órfãos)
 * vive no runner — caminho compartilhado entre web/whatsapp/simulador. Sem
 * este teste, o canal web continuaria silenciosamente bugado pra leads que
 * vieram pela web (admin abre conversa → cards de comparativo somem).
 *
 * Cenário coberto: `pipeDirectiveTurn` (entry point do canal web no
 * orchestrator) com diretiva que faz o agent emitir `present_simulation_result`.
 * Após o turn, o histórico (mesma query do admin) precisa ter:
 *   - 1 message role=assistant (placeholder do tool-only turn) com channel=web
 *   - 1 artifact tipo simulation_result vinculado à message
 *
 * Anti-regressão: se alguém remover o `db.insert(artifactsTable)` do runner
 * de novo, ESTE teste e o do WhatsApp falham juntos — bloqueio dobrado.
 *
 * Como rodar:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5434/aja_agora \
 *     npx vitest run src/lib/web/lead-history-completeness.test.ts \
 *     --reporter=verbose
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks (antes de qualquer import do código de produção) ─────────────────

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
			userIntent: "neutral",
			extraSignals: [],
		}),
	};
});

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => {
				const parts: Array<
					| { type: "text-delta"; text: string }
					| {
							type: "tool-call";
							toolName: string;
							input: Record<string, unknown>;
							toolCallId: string;
					  }
				> = [
					{
						type: "tool-call",
						toolName: "present_simulation_result",
						input: {
							groupId: "g1-web",
							creditValue: 30000,
							monthlyPayment: 500,
							adminFee: 1000,
							reserveFund: 100,
							insurance: 100,
							totalCost: 32000,
							termMonths: 60,
							effectiveRate: 2.1,
						},
						toolCallId: "tc-sim-web-1",
					},
				];
				return {
					fullStream: (async function* () {
						for (const p of parts) yield p;
					})(),
					finishReason: Promise.resolve("tool-calls" as "stop" | "tool-calls"),
					providerMetadata: Promise.resolve({}),
				};
			},
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

// ─── Imports do código de produção (após os mocks) ──────────────────────────

const { db } = await import("@/db");
const { conversations, leads } = await import("@/db/schema");
const { pipeDirectiveTurn } = await import("./adapter");

// ─── Stub Writer (canal web emite eventos pra UI stream; teste descarta) ────

function noopWriter() {
	return {
		write: vi.fn(),
		// merge / onError não usados pelo runner; stub vazio basta
	} as unknown as Parameters<typeof pipeDirectiveTurn>[0]["writer"];
}

// ─── Fixture ────────────────────────────────────────────────────────────────

async function seedFixture(): Promise<{ convId: string; leadId: string }> {
	const [conv] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: "active",
			contactName: "Cliente Web",
			isSimulated: true,
			metadata: {
				currentPersona: "moto",
				currentCategory: "moto",
				expertiseLevel: "neutro",
				searchDispatched: true,
			},
		})
		.returning();

	const [lead] = await db
		.insert(leads)
		.values({
			conversationId: conv.id,
			name: "Cliente Web",
			email: null,
			stage: "em_negociacao",
			isSimulated: true,
		})
		.returning();

	return { convId: conv.id, leadId: lead.id };
}

async function cleanup(convId: string): Promise<void> {
	await db.delete(conversations).where(eq(conversations.id, convId));
}

// Mesma forma que o admin lê — replicado do teste WhatsApp e da rota.
async function fetchAdminHistory(leadId: string) {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.id, leadId),
		with: {
			conversation: {
				with: {
					messages: {
						orderBy: (m, { asc }) => [asc(m.createdAt)],
						with: { artifacts: true },
					},
				},
			},
		},
	});
	if (!lead?.conversation) throw new Error(`lead ${leadId} sem conversation`);
	return lead.conversation.messages;
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe("BUG-LEAD-HISTORY-INCOMPLETE — canal WEB persiste artifact emitido pelo agent", () => {
	let convId: string;
	let leadId: string;

	beforeEach(async () => {
		const seeded = await seedFixture();
		convId = seeded.convId;
		leadId = seeded.leadId;
	});

	afterEach(async () => {
		await cleanup(convId);
	});

	it("após agent emitir present_simulation_result via pipeDirectiveTurn (channel=web), histórico admin contém o artifact persistido com FK pra message", async () => {
		await pipeDirectiveTurn({
			conversationId: convId,
			directive: "[directive interno: emitir simulação web pro grupo g1-web]",
			contactName: "Cliente Web",
			writer: noopWriter(),
		});

		const messages = await fetchAdminHistory(leadId);

		// Asserts duros — VALOR, não verdadeiro/falso vago.
		const assistantMessages = messages.filter((m) => m.role === "assistant");
		expect(
			assistantMessages.length,
			"esperava 1 message assistant (placeholder do tool-only turn)",
		).toBeGreaterThanOrEqual(1);

		// Todas as mensagens deveriam estar com channel=web — invariante de canal.
		const channels = new Set(messages.map((m) => m.channel));
		expect(channels, "todas as mensagens deste turno deveriam ter channel=web").toEqual(
			new Set(["web"]),
		);

		// Artifact persistido com tipo simulation_result vinculado a uma message.
		const allArtifacts = messages.flatMap((m) =>
			(
				(
					m as unknown as {
						artifacts: Array<{ type: string; payload: Record<string, unknown>; messageId: string }>;
					}
				).artifacts ?? []
			).map((a) => ({
				...a,
				parentMessageId: m.id,
				parentRole: m.role,
			})),
		);
		const simArtifacts = allArtifacts.filter((a) => a.type === "simulation_result");
		expect(
			simArtifacts.length,
			`esperava 1 artifact persistido com type=simulation_result no histórico web; achei ${allArtifacts.length} artifacts total, tipos: [${allArtifacts.map((a) => a.type).join(", ")}]`,
		).toBe(1);

		// Payload tem o groupId que o stub emitiu — prova que persistimos o valor real.
		expect(simArtifacts[0].payload.groupId, "payload do artifact persistido perdeu o groupId").toBe(
			"g1-web",
		);
		// E o artifact tem que estar vinculado a uma message do tipo assistant.
		expect(
			simArtifacts[0].parentRole,
			"artifact ficou órfão de um turno user/system em vez de assistant",
		).toBe("assistant");
	}, 30_000);
});
