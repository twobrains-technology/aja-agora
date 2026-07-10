/**
 * FIX-251 (P0, veredito Fable FINAL §N-A, 2026-07-10) — Fechamento com âncora
 * stale: reproduz a sequência EXATA do Fluxo B que fechava o plano ERRADO.
 *
 * 1. Reveal já aconteceu: RODOBENS 90.000 / R$ 1.218,92 recomendada e exibida
 *    (comparison_table persistido com RODOBENS + ITAÚ).
 * 2. What-if "quero a ITAÚ" → simulate_quota devolve 161.258 / R$ 2.984,38 —
 *    o runner re-ancora meta.recommendedOffer no artifact do what-if (FIX-6,
 *    comportamento LEGÍTIMO e inalterado: o dial acompanha o último
 *    detalhamento visto).
 * 3. Usuário REJEITA e reconfirma RODOBENS por texto — SEM nova tool-call
 *    (sem novo simulation_result pra re-ancorar automaticamente).
 * 4. O turno de fechamento chama present_contract_form com
 *    administradora="RODOBENS" (o que o agente efetivamente anuncia ao vivo,
 *    ver veredito "contract_form exibe RODOBENS").
 *
 * ANTES do fix: meta.recommendedOffer ficava PRESO no snapshot da ITAÚ
 * (161.258) — contract-input.ts usava esse valor stale e o clamp de 20%
 * excluía a RODOBENS, fechando ITAU 161.258 (79% acima do pedido).
 *
 * DEPOIS do fix: o runner re-ancora recommendedOffer/recommendedAdministradora
 * pela administradora que o PRÓPRIO turno de fechamento anuncia, resolvida
 * server-side contra os grupos REALMENTE exibidos (findOfferByAdministradora) —
 * o fechamento fecha RODOBENS 90.000, não ITAU 161.258.
 */

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildStartContractInput } from "@/lib/bevi/contract-input";

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

// Script determinístico por turno: turno 1 (what-if ITAÚ) simula e apresenta a
// oferta REJEITADA depois; turno 2 (fechamento) apresenta o form já anunciando
// a administradora que o usuário reconfirmou por texto (RODOBENS) — exatamente
// como o veredito registrou ao vivo ("contract_form exibe RODOBENS").
let turnCount = 0;
vi.mock("@/lib/agent/agents", () => {
	function whatIfItauAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", text: "Beleza, aqui está a simulação da ITAÚ:" };
					yield {
						type: "tool-call",
						toolName: "simulate_quota",
						input: { groupId: "g-itau", creditValue: 161258 },
						toolCallId: "tc-sim-itau",
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
							groupId: "g-itau",
							administradora: "ITAU",
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

	function closeContractRodobensAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						text: "Show, vamos seguir com a RODOBENS então! Pra confirmar sua reserva, só preciso de uns dados rápidos:",
					};
					yield {
						type: "tool-call",
						toolName: "present_contract_form",
						input: { administradora: "RODOBENS" },
						toolCallId: "tc-contract-1",
					};
				})(),
				finishReason: Promise.resolve("tool-calls" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}

	return {
		resolveAgent: vi.fn().mockImplementation(async () => {
			turnCount += 1;
			return turnCount === 1 ? whatIfItauAgent() : closeContractRodobensAgent();
		}),
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

/** Fim do passo 4 (reveal RODOBENS já apresentado e decidido) — exatamente o
 * estado da conversa real quando o Fluxo B começa o what-if. */
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

async function driveTurn(
	conversationId: string,
	userText: string,
	userIntent: "providing_info" | "neutral" = "neutral",
): Promise<{ artifactTypes: string[] }> {
	const artifactTypes: string[] = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Mario",
		skipLeadCollection: true,
		// FIX-239 (decisionDispatched===true + intent "ready_to_proceed") reescreve
		// o texto do usuário por uma directive server-side de avanço direto —
		// mascararia o texto LITERAL que este teste precisa resolver ("quero a
		// ITAÚ"/"Deixa a RODOBENS"). O script do agente mockado já fixa a
		// sequência de tool-calls; skipAnalyzer preserva o texto real no histórico.
		skipAnalyzer: true,
		userIntent,
		userKey: null,
	});
	for await (const ev of gen) {
		if (ev.type === "artifact") artifactTypes.push(ev.artifactType);
	}
	return { artifactTypes };
}

async function loadMeta(conversationId: string): Promise<ConversationMetadata> {
	const row = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
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

describe("FIX-251 — âncora do fechamento: Fluxo B fecha RODOBENS, não a ITAÚ do what-if rejeitado", () => {
	let convId: string;

	afterEach(async () => {
		await cleanup(convId);
	});

	it("what-if ITAÚ + fechamento anunciando RODOBENS → recommendedOffer re-ancora em RODOBENS (não fica preso em 161.258)", async () => {
		turnCount = 0;
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Mario", metadata: POS_REVEAL_RODOBENS_META })
			.returning();
		convId = c.id;

		// Pré-semeia o reveal: comparison_table com RODOBENS + ITAÚ REALMENTE
		// exibidos — é contra isso que o fechamento re-resolve a administradora.
		const [revealMsg] = await db
			.insert(messagesTable)
			.values({
				conversationId: convId,
				role: "assistant",
				content: "Aqui estão as opções:",
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
						creditValue: 90000,
						termMonths: 180,
						monthlyPayment: 1218.92,
					},
					{
						id: "g-itau",
						groupId: "g-itau",
						administradora: "ITAU",
						creditValue: 161258,
						termMonths: 200,
						monthlyPayment: 2984.38,
					},
				],
			},
		});

		// Turno 1 — what-if: "quero a ITAÚ" simula e re-ancora (legítimo, FIX-6).
		// userIntent="providing_info" — o mesmo sinal que o analyzer real produz
		// pra um what-if explícito (o guard reveal-loop só deixa simulation_result
		// passar com esse intent; artifact-guard.ts:172).
		await driveTurn(convId, "quero a ITAÚ", "providing_info");
		const afterWhatIf = await loadMeta(convId);
		expect(
			afterWhatIf.recommendedOffer?.creditValue,
			"pré-condição do bug: o what-if precisa ter re-ancorado na ITAÚ",
		).toBe(161258);

		// Turno 2 — usuário rejeitou por texto e reconfirmou RODOBENS; o
		// fechamento (present_contract_form) anuncia RODOBENS.
		const { artifactTypes } = await driveTurn(
			convId,
			"Ficou caro. Deixa a RODOBENS que você recomendou mesmo.",
		);
		expect(artifactTypes).toContain("contract_form");

		const afterClose = await loadMeta(convId);
		expect(
			afterClose.recommendedOffer?.creditValue,
			"FIX-251: o fechamento tem que re-ancorar em RODOBENS (90.000), NUNCA fechar com o snapshot stale da ITAÚ (161.258)",
		).toBe(90000);
		expect(afterClose.recommendedAdministradora).toBe("RODOBENS");

		// Prova ponta-a-ponta: o input que IRIA pra Bevi fecha o plano CERTO.
		const contractInput = buildStartContractInput(afterClose, {
			cpf: "12345678900",
			celular: "5511999999999",
			lgpd: true,
		});
		expect(contractInput.valor).toBe(90000);
		expect(contractInput.administradoraPreferida).toBe("RODOBENS");
	});
});
