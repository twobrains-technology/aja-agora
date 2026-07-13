// FIX-331 (rodada 10, veredito Sonnet A.8/A.9 — achado ao vivo, root cause
// confirmada em produção): depois do simulador (contemplation_dial) ser
// respondido por TEXTO LIVRE (`simulatorOfferAnswered=true`), se o usuário
// segue confirmando por texto livre ("Perfeito, quero fechar!") em vez de
// clicar um botão, `nextGate()` já aponta "decision" — mas só o cálculo
// TARDIO (pós-modelo, em `runner.ts`) disparava esse gate. Nesse meio-tempo,
// o modelo (ainda no toolset da fase "reveal", já que `decisionDispatched`
// continua false) às vezes tenta avançar sozinho (`present_contract_form`/
// `present_decision_prompt`) — tool FORA da policy, `tool_error`, que
// SUPRIME TODA a computação de gate desse turno (guard do tool-error-
// recovery). Como o gate nunca avança, o PRÓXIMO turno reproduz o MESMO
// problema pra sempre — achado ao vivo (recoleta ad-hoc): a conversa trava
// definitivamente depois do dial, nunca mais fecha por texto (confirmado no
// Postgres real: nenhum `contract_form`/`decision_prompt` jamais persistido).
//
// Fix: intercepta ANTES de chamar o modelo — mesmo padrão do FIX-260
// (simulator-offer)/FIX-297 (reco-consent)/FIX-325 (menção de
// administradora) — usando as MESMAS funções puras (`nextGate`/
// `decideShowGate`) que o cálculo tardio já usa, sem duplicar lógica de
// decisão nova. O modelo NUNCA chega a rodar neste turno — o card sai
// determinístico, sem risco de tool-error.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

let mockIntent = "neutral";

vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual =
		await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>("@/lib/agent/turn-analyzer");
	return {
		...actual,
		analyzeTurn: vi.fn().mockImplementation(async () => ({
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
			userIntent: mockIntent,
			extraSignals: [],
		})),
	};
});

// Agente MOCADO que, se for chamado, tenta avançar sozinho pro fechamento
// (mesma tool fora de policy que reproduz o bug ao vivo) — se o intercepto
// não disparar ANTES do modelo rodar, o teste falha por tool-error, não por
// falta de artifact (prova que o modelo NUNCA deveria ser chamado aqui).
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			// FIX-331: o mock só tenta a tool FORA de policy quando vê a
			// mensagem ORIGINAL do usuário (o gatilho real do bug) — sub-turnos
			// de diretiva (buildScarcityDirective/buildDecisionPromptDirective,
			// disparados por `dispatchDecisionCascade` DEPOIS que
			// decisionDispatched já virou true, fase já "closing") respondem só
			// com texto, como o modelo faria de verdade nessa fase.
			stream: async (args: { messages?: Array<{ role: string; content?: unknown }> }) => {
				const lastUser = [...(args.messages ?? [])].reverse().find((m) => m.role === "user");
				const lastUserText =
					typeof lastUser?.content === "string"
						? lastUser.content
						: JSON.stringify(lastUser?.content ?? "");
				const isOriginalProblemTurn = lastUserText.includes("Quero seguir e fechar");
				return {
					fullStream: (async function* () {
						if (isOriginalProblemTurn) {
							yield {
								type: "tool-call",
								toolName: "present_contract_form",
								input: {},
								toolCallId: "tc-would-error",
							};
						} else {
							yield { type: "text-delta", text: "Show, seguimos com você." };
						}
					})(),
					finishReason: Promise.resolve("tool-calls" as const),
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

vi.mock("@/lib/agent/personas-repo", () => ({
	getPersona: vi.fn().mockResolvedValue({
		id: "auto",
		role: "specialist",
		category: "auto",
		isActive: true,
		examples: [],
	}),
}));

const { db: dbReal } = await import("@/db");
const { runTurn } = await import("@/lib/agent/orchestrator");
void dbReal;

// Estado logo APÓS o dial ter sido respondido por texto livre
// (simulatorOfferAnswered=true) — nextGate() já aponta "decision", mas
// decisionDispatched ainda é false.
function awaitingDecisionMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		desireAsked: true,
		currentPersona: "auto",
		currentCategory: "auto",
		experiencePrev: "returning",
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		recoConsentDispatched: true,
		recoConsentAnswered: true,
		simulatorOfferDispatched: true,
		simulatorOfferAnswered: true,
		decisionDispatched: false,
		recommendedAdministradora: "ITAÚ",
		recommendedOffer: {
			administradora: "ITAÚ",
			category: "auto",
			creditValue: 92_902,
			termMonths: 51,
			monthlyPayment: 2182.01,
			groupId: "grp-itau",
		},
		qualifyAnswers: {
			creditMin: 76_500,
			creditMax: 92_902,
			prazoMeses: 12,
			hasLance: "yes",
			lanceValue: 50_000,
			lanceEmbutido: true,
		},
		...over,
	};
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

describeIfDb("FIX-331 — confirmação por TEXTO LIVRE pós-dial dispara decision/scarcity SEM chamar o modelo", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it('intent="ready_to_proceed" após o dial dispara scarcity+decision_prompt e marca decisionDispatched — sem tool-error', async () => {
		mockIntent = "ready_to_proceed";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Madalena", channel: "web", metadata: awaitingDecisionMeta() })
			.returning();
		convId = c.id;

		const events: Array<{ type: string; artifactType?: string }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "Perfeito, faz muito sentido pra mim. Quero seguir e fechar!",
			isUserTurn: true,
			contactName: "Madalena",
			skipLeadCollection: true,
			userKey: null,
		});
		for await (const ev of gen) {
			events.push(ev.type === "artifact" ? { type: ev.type, artifactType: ev.artifactType } : { type: ev.type });
		}

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "scarcity")).toBe(true);
		expect(events.some((e) => e.type === "artifact" && e.artifactType === "decision_prompt")).toBe(true);

		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
		const meta = conv?.metadata as ConversationMetadata;
		expect(meta.decisionDispatched).toBe(true);

		// Ground truth: NENHUM artifact "fantasma" de tool-error (o modelo nunca
		// deveria ter sido chamado neste turno).
		const persistedArtifacts = await db
			.select({ type: artifactsTable.type })
			.from(artifactsTable)
			.innerJoin(messagesTable, eq(artifactsTable.messageId, messagesTable.id))
			.where(eq(messagesTable.conversationId, convId));
		expect(persistedArtifacts.some((a) => a.type === "contract_form")).toBe(false);
	});

	it('hasLance="so_parcela" + intent="ready_to_proceed" dispara two_paths (não scarcity/decision_prompt), mesma idempotência', async () => {
		mockIntent = "ready_to_proceed";
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Mario",
				channel: "web",
				metadata: {
					...awaitingDecisionMeta(),
					qualifyAnswers: { creditMin: 76_500, creditMax: 90_000, prazoMeses: 12, hasLance: "so_parcela" },
				},
			})
			.returning();
		convId = c.id;

		const events: Array<{ type: string; artifactType?: string }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "Perfeito, faz muito sentido pra mim. Quero seguir e fechar!",
			isUserTurn: true,
			contactName: "Mario",
			skipLeadCollection: true,
			userKey: null,
		});
		for await (const ev of gen) {
			events.push(ev.type === "artifact" ? { type: ev.type, artifactType: ev.artifactType } : { type: ev.type });
		}

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "two_paths")).toBe(true);
		expect(events.some((e) => e.type === "artifact" && e.artifactType === "scarcity")).toBe(false);
		expect(events.some((e) => e.type === "artifact" && e.artifactType === "decision_prompt")).toBe(false);
	});

	it("regressão — decisionDispatched já true NÃO redispara (idempotência preservada)", async () => {
		mockIntent = "ready_to_proceed";
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Madalena",
				channel: "web",
				metadata: { ...awaitingDecisionMeta(), decisionDispatched: true },
			})
			.returning();
		convId = c.id;

		const events: Array<{ type: string; artifactType?: string }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "Perfeito, faz muito sentido pra mim. Quero seguir e fechar!",
			isUserTurn: true,
			contactName: "Madalena",
			skipLeadCollection: true,
			userKey: null,
		});
		for await (const ev of gen) {
			events.push(ev.type === "artifact" ? { type: ev.type, artifactType: ev.artifactType } : { type: ev.type });
		}

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "scarcity")).toBe(false);
		expect(events.some((e) => e.type === "artifact" && e.artifactType === "decision_prompt")).toBe(false);
	});

	it("regressão — intent que NÃO sinaliza avanço (asking_question) não dispara nada, deixa o modelo conversar normalmente", async () => {
		mockIntent = "asking_question";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Madalena", channel: "web", metadata: awaitingDecisionMeta() })
			.returning();
		convId = c.id;

		const events: Array<{ type: string; artifactType?: string }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "Como funciona se eu quiser desistir depois?",
			isUserTurn: true,
			contactName: "Madalena",
			skipLeadCollection: true,
			userKey: null,
		});
		for await (const ev of gen) {
			events.push(ev.type === "artifact" ? { type: ev.type, artifactType: ev.artifactType } : { type: ev.type });
		}

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "scarcity")).toBe(false);
		expect(events.some((e) => e.type === "artifact" && e.artifactType === "decision_prompt")).toBe(false);

		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
		const meta = conv?.metadata as ConversationMetadata;
		expect(meta.decisionDispatched ?? false).toBe(false);
	});
});
