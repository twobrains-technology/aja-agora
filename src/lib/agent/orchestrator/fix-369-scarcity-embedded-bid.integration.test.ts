/**
 * FIX-369 — reprodução (rodada 2, bloco-j).
 *
 * Card original hipotetizava bypass via `present_decision_prompt` chamado
 * como tool-call direto do modelo. REFUTADO por leitura de código: a tool
 * nunca entra em `allowedTools()` (tool-policy.ts) em NENHUMA fase desde o
 * FIX-253 (comentário no próprio arquivo: "mata a tool por completo") — o
 * modelo não tem como chamá-la, então o guard de `runner.ts:1605`
 * (`artifacts.some(a => a.type === "decision_prompt")`) é hoje inalcançável
 * pra essa tool.
 *
 * Hipótese alternativa levantada durante a investigação (assimetria clique×
 * texto no gate `simulator-offer`) também foi TESTADA e REFUTADA por este
 * arquivo: `nextGate()` (qualify-state.ts) só olha `simulatorOfferDispatched`
 * pra liberar o gate `decision` — `simulatorOfferAnswered` é só bookkeeping
 * pra não re-emitir a agulha, nunca um bloqueio de fato. O teste
 * "cascata dispara..." abaixo prova que `dispatchDecisionCascade` (e
 * `buildScarcityCard` dentro dela) funciona corretamente por TEXTO LIVRE,
 * sem depender de clique nenhum.
 *
 * Causa real confirmada aqui: `buildScarcityCard` (server-cards.ts) só monta
 * o card quando `meta.recommendedOffer.availableSlots` é um número real —
 * por desenho (Lei 1, nunca fabricar dado) ele NÃO inventa vagas quando a
 * Bevi não devolveu `monthlyAwardedQuotas` pro grupo. O teste "sem
 * availableSlots..." abaixo reproduz exatamente isso: a cascata inteira
 * dispara (decision_prompt aparece, decisionDispatched vira true, a
 * contratação segue normal) mas SEM scarcity — nenhum erro, nenhum crash,
 * card simplesmente ausente. Isso bate com o relato da persona 2 ("o fluxo
 * seguiu direto pra confirmação, sem card de escassez") sem exigir nenhum
 * bug de controle de fluxo: o gap é de DADO (Bevi sem `availableSlots` pra
 * aquele grupo/categoria no momento da simulação), não de código.
 *
 * Ver `.done/2026-07-22-bloco-j-resume-escassez-rodada2.md` pro relato
 * completo da investigação e o achado escrito como FIX-370 (inbox).
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// ─── Mocks (antes de qualquer import do código de produção) ─────────────────

const analyzeTurnMock = vi.fn();
vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>(
		"@/lib/agent/turn-analyzer",
	);
	return { ...actual, analyzeTurn: analyzeTurnMock };
});

// resolveAgent devolve SÓ TEXTO (nenhuma tool-call) — qualquer card que
// aparecer no stream tem que vir de emissão SERVER-SIDE determinística,
// nunca de o modelo "decidir" chamar uma tool (prova viva de que
// present_decision_prompt/scarcity não dependem do LLM).
vi.mock("@/lib/agent/agents", () => {
	function makeAgent(text: string) {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", text };
				})(),
				finishReason: Promise.resolve("stop" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}
	return {
		resolveAgent: vi.fn().mockResolvedValue(makeAgent("Beleza, seguindo com você.")),
		invalidateAgentCache: vi.fn(),
	};
});

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { db } = await import("@/db");
const { conversations } = await import("@/db/schema");
const { pipeUserTurn } = await import("@/lib/web/adapter");

function fakeAnalysis(userIntent: string) {
	return {
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
		userIntent,
		extraSignals: [],
	};
}

type Part = { type: string; data?: { type?: string; payload?: unknown } };
function fakeWriter() {
	const parts: Part[] = [];
	return {
		parts,
		write: (p: Part) => {
			parts.push(p);
		},
	};
}

// Estado: reveal completo, lance considerado + embutido aceito, agulha
// (simulator-offer) JÁ mostrada — ponto exato em que persona 2 (moto, lance
// embutido) estava antes de "seguir direto pra confirmação" (dossiê rodada 1).
const BASE_META: ConversationMetadata = {
	currentPersona: "moto",
	currentCategory: "moto",
	desireAsked: true,
	identityCollected: true,
	revealCompleted: true,
	searchDispatched: true,
	experiencePrev: "first",
	qualifyAnswers: {
		creditMax: 25_000,
		prazoMeses: 12,
		hasLance: "yes",
		lanceValue: 500,
		lanceEmbutido: true,
		lanceEmbutidoPercent: 30,
	},
	recommendedAdministradora: "Canopus",
	recommendedOffer: {
		administradora: "Canopus",
		category: "moto",
		groupId: "grupo-4400-moto",
		creditValue: 30_000,
		termMonths: 96,
		monthlyPayment: 475.93,
		availableSlots: 3,
	},
	simulatorOfferDispatched: true,
	decisionDispatched: false,
};

async function seedConversation(meta: ConversationMetadata): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", contactName: "Diego", metadata: meta })
		.returning();
	return conv.id;
}

async function metadataOf(convId: string): Promise<ConversationMetadata | undefined> {
	const row = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
	return row?.metadata as ConversationMetadata | undefined;
}

async function cleanup(convId: string): Promise<void> {
	await db.delete(conversations).where(eq(conversations.id, convId));
}

beforeAll(() => vi.stubEnv("AI_RUNTIME", "vercel"));
afterAll(() => vi.unstubAllEnvs());

describeIfDb("FIX-369 — reprodução: cascata scarcity→decision no fluxo de lance embutido", () => {
	let convId: string;
	beforeEach(() => {
		analyzeTurnMock.mockReset();
	});
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("com availableSlots real no snapshot, a cascata determinística emite scarcity ANTES/JUNTO do decision_prompt — por TEXTO LIVRE, sem clique e sem tool-call do modelo", async () => {
		analyzeTurnMock.mockResolvedValue(fakeAnalysis("ready_to_proceed"));
		convId = await seedConversation(BASE_META);

		const writer = fakeWriter();
		await pipeUserTurn({
			conversationId: convId,
			userText: "sim, quero ver!",
			contactName: "Diego",
			writer: writer as never,
		});

		const artifactTypes = writer.parts
			.filter((p) => p.type === "data-artifact")
			.map((p) => p.data?.type);
		expect(
			artifactTypes,
			`esperava scarcity + decision_prompt; recebi: ${artifactTypes.join(", ") || "(nenhum)"}`,
		).toEqual(expect.arrayContaining(["scarcity", "decision_prompt"]));
		expect(artifactTypes.indexOf("scarcity")).toBeLessThanOrEqual(
			artifactTypes.indexOf("decision_prompt"),
		);

		const meta = await metadataOf(convId);
		expect(meta?.decisionDispatched).toBe(true);
	});

	it("SEM availableSlots no snapshot (Bevi não devolveu vagas pro grupo) — decision_prompt dispara normalmente, scarcity fica ausente (nunca fabricado, Lei 1) — root cause real do 0/3 da rodada 1", async () => {
		analyzeTurnMock.mockResolvedValue(fakeAnalysis("ready_to_proceed"));
		convId = await seedConversation({
			...BASE_META,
			recommendedOffer: {
				administradora: "Canopus",
				category: "moto",
				groupId: "grupo-4400-moto",
				creditValue: 30_000,
				termMonths: 96,
				monthlyPayment: 475.93,
			},
		});

		const writer = fakeWriter();
		await pipeUserTurn({
			conversationId: convId,
			userText: "sim, quero ver!",
			contactName: "Diego",
			writer: writer as never,
		});

		const artifactTypes = writer.parts
			.filter((p) => p.type === "data-artifact")
			.map((p) => p.data?.type);
		expect(artifactTypes).toContain("decision_prompt");
		expect(
			artifactTypes,
			`scarcity NÃO deveria aparecer sem availableSlots real; artifacts: ${artifactTypes.join(", ")}`,
		).not.toContain("scarcity");

		const meta = await metadataOf(convId);
		expect(meta?.decisionDispatched).toBe(true);
	});
});
