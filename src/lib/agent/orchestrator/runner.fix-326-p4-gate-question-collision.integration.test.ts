/**
 * FIX-326 (rodada 10, veredito Sonnet A.5/A.6 — P4, teto explícito da r10):
 * achado sistemático em MÚLTIPLAS recoletas ao vivo — o texto do modelo
 * termina com uma pergunta própria ("Quer seguir com a Canopus?") no MESMO
 * turno em que um gate estrutural com pergunta própria dispara ("Em quanto
 * tempo você quer estar com o carro novo?"), colando as duas no mesmo balão.
 *
 * Causa-raiz: o `EphemeralTextFilter` (sanitizer.ts, FIX-298) segura a última
 * pergunta do modelo até o flush FINAL do turno (runner.ts) — mas esse flush
 * acontece ANTES do cálculo de `nextGateToFire`, que só roda bem mais adiante
 * na mesma função. Quando o flush libera, o código ainda não sabe se um gate
 * vai anexar a PRÓPRIA pergunta em seguida.
 *
 * Fix: antes do flush final, o runner PREVÊ (com as mesmas funções puras
 * `nextGate`/`decideShowGate`/`allowGateWithArtifacts`, dado 100% local — sem
 * duplicar lógica) se um gate com pergunta própria vai disparar neste turno.
 * Se sim, descarta a pergunta segurada do modelo (`discardHeldQuestion`) em
 * vez de liberá-la — só a pergunta CANÔNICA do gate sobrevive.
 *
 * Teste de INTEGRAÇÃO (mesmo padrão do FIX-316): sobe `runTurn` REAL contra o
 * DB real, com um agente MOCADO que só produz texto terminando em pergunta.
 */

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

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
		resolveAgent: vi.fn().mockResolvedValue(
			makeAgent("Perfeito! Quer seguir com a Canopus?"),
		),
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

const { runTurn } = await import("@/lib/agent/orchestrator");

// Estado logo ANTES do gate `timeframe` disparar: experience/reco-consent já
// resolvidos, prazoMeses ainda undefined — nextGate() devolve "timeframe"
// (que TEM pergunta própria: "Em quanto tempo você quer estar com o carro
// novo?", gate-questions.ts:164-165, TIMEFRAME_QUESTIONS[category]).
const AWAITING_TIMEFRAME_META: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "auto",
	currentCategory: "auto",
	experiencePrev: "returning",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	decisionDispatched: false,
	qualifyAnswers: { creditMin: 76_500, creditMax: 90_000 },
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

describe("FIX-326 — pergunta do modelo NÃO cola com a pergunta do gate no mesmo turno (P4)", () => {
	let convId: string;
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it('modelo termina com pergunta própria ("Quer seguir com a Canopus?") no MESMO turno em que gate:timeframe dispara — a pergunta do modelo é descartada, só a do gate sobrevive', async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Mario", channel: "web", metadata: AWAITING_TIMEFRAME_META })
			.returning();
		convId = c.id;

		const events: Array<{ type: string; text?: string; gate?: string }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "A Canopus parece boa, parcela baixa",
			isUserTurn: true,
			contactName: "Mario",
			skipLeadCollection: true,
			skipAnalyzer: true,
			userIntent: "providing_info",
			userKey: null,
		});
		for await (const ev of gen) {
			if (ev.type === "text-delta") events.push({ type: ev.type, text: ev.text });
			else if (ev.type === "gate") events.push({ type: ev.type, gate: ev.gate });
			else events.push({ type: ev.type });
		}

		const fullText = events
			.filter((e) => e.type === "text-delta")
			.map((e) => e.text)
			.join("");

		expect(
			events.some((e) => e.type === "gate" && e.gate === "timeframe"),
			`esperava o gate timeframe disparar neste turno — eventos: ${JSON.stringify(events)}`,
		).toBe(true);
		expect(
			fullText,
			"a pergunta PRÓPRIA do modelo não pode sobreviver quando um gate com pergunta própria dispara no mesmo turno",
		).not.toContain("Quer seguir com a Canopus?");
		expect(fullText).toContain("Perfeito!");

		// Persistência: a mensagem salva no DB também não pode ter a pergunta
		// duplicada (não é só um problema de stream ao vivo).
		const [savedMsg] = await db
			.select({ content: messagesTable.content })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId))
			.orderBy(messagesTable.createdAt);
		const savedTexts = await db
			.select({ content: messagesTable.content, role: messagesTable.role })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		const assistantMsg = savedTexts.find((m) => m.role === "assistant");
		expect(assistantMsg?.content).not.toContain("Quer seguir com a Canopus?");
		void savedMsg;
	});

	it("REGRESSÃO — turno SEM gate disparando no fim continua emitindo a pergunta do modelo normalmente", async () => {
		// decisionDispatched=true + hasLance="so_parcela" já resolvido faz
		// nextGate() cair no terminal "search" (sem pergunta própria nenhuma) —
		// não há gate concorrendo, a pergunta do modelo deve sobreviver.
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Mario",
				channel: "web",
				metadata: {
					...AWAITING_TIMEFRAME_META,
					qualifyAnswers: { ...AWAITING_TIMEFRAME_META.qualifyAnswers, prazoMeses: 12, hasLance: "so_parcela" },
					decisionDispatched: true,
				},
			})
			.returning();
		convId = c.id;

		const events: Array<{ type: string; text?: string; gate?: string }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "Perfeito, pode confirmar",
			isUserTurn: true,
			contactName: "Mario",
			skipLeadCollection: true,
			skipAnalyzer: true,
			userIntent: "providing_info",
			userKey: null,
		});
		for await (const ev of gen) {
			if (ev.type === "text-delta") events.push({ type: ev.type, text: ev.text });
			else events.push({ type: ev.type });
		}

		const fullText = events
			.filter((e) => e.type === "text-delta")
			.map((e) => e.text)
			.join("");
		expect(fullText).toContain("Quer seguir com a Canopus?");
	});

	// FIX-328 (rodada 10, veredito Sonnet A.7 — achado PROVADO pelo juiz, não
	// hipótese): a previsão do FIX-326 só replicava revealCompleted/
	// searchDispatched/decisionDispatched — mas `shouldMarkDoubtsAddressed`
	// (qualify-state.ts) marca `meta.doubtsAddressed=true` NA MESMA janela
	// (runner.ts, ANTES do cálculo real de nextGateToFire, DEPOIS do bloco de
	// previsão) quando o usuário responde por texto livre a um `experience`
	// respondido como "doubts". Sem replicar isso, a previsão calculava
	// "doubts-wait" (isento, sem pergunta própria) enquanto o cálculo real,
	// com doubtsAddressed já persistido, avançava pra "reco-consent" (TEM
	// pergunta própria) — reproduzindo a MESMA colisão que o FIX-326 deveria
	// ter fechado, só que por um caminho que os testes originais não cobriam.
	it("FIX-328 — doubts→reco-consent no MESMO turno: pergunta do modelo some, só a do gate reco-consent sobrevive", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Mario",
				channel: "web",
				metadata: {
					...AWAITING_TIMEFRAME_META,
					experiencePrev: "doubts",
					doubtsAddressed: false,
					recoConsentDispatched: true,
					recoConsentAnswered: undefined,
				},
			})
			.returning();
		convId = c.id;

		const events: Array<{ type: string; text?: string; gate?: string }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "Entendi, faz sentido",
			isUserTurn: true,
			contactName: "Mario",
			skipLeadCollection: true,
			skipAnalyzer: true,
			userIntent: "neutral",
			userKey: null,
		});
		for await (const ev of gen) {
			if (ev.type === "text-delta") events.push({ type: ev.type, text: ev.text });
			else if (ev.type === "gate") events.push({ type: ev.type, gate: ev.gate });
			else events.push({ type: ev.type });
		}

		const fullText = events
			.filter((e) => e.type === "text-delta")
			.map((e) => e.text)
			.join("");

		expect(
			events.some((e) => e.type === "gate" && e.gate === "reco-consent"),
			`esperava o gate reco-consent disparar neste turno — eventos: ${JSON.stringify(events)}`,
		).toBe(true);
		expect(
			fullText,
			"a pergunta PRÓPRIA do modelo não pode sobreviver quando doubtsAddressed libera reco-consent no mesmo turno",
		).not.toContain("Quer seguir com a Canopus?");
		expect(fullText).toContain("Perfeito!");
	});

	// FIX-329 (rodada 10, veredito Sonnet A.8 — achado provado por sonda do
	// juiz, campo hoje vestigial mas defesa-em-profundidade pra conversas
	// legadas): `pendingFollowUp` (gate `consent`/"Entender mais antes",
	// removido do funil novo pelo FIX-274) só é limpo em runtime (ANTES do
	// cálculo real de nextGateToFire, DEPOIS do bloco de previsão) — sem
	// replicar isso, uma conversa legada com pendingFollowUp=true ainda
	// persistido teria a MESMA colisão de P4 que FIX-326/328 já fecham pros
	// outros 2 campos (doubtsAddressed/discoveredCreditTarget).
	it("FIX-329 — pendingFollowUp limpo no turno: pergunta do modelo some, só a do gate seguinte (credit) sobrevive", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Mario",
				channel: "web",
				metadata: {
					desireAsked: true,
					currentPersona: "auto",
					currentCategory: "auto",
					identityCollected: false,
					pendingFollowUp: true,
					qualifyAnswers: {},
				},
			})
			.returning();
		convId = c.id;

		const events: Array<{ type: string; text?: string; gate?: string }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "Entendi, obrigado",
			isUserTurn: true,
			contactName: "Mario",
			skipLeadCollection: true,
			skipAnalyzer: true,
			userIntent: "neutral",
			userKey: null,
		});
		for await (const ev of gen) {
			if (ev.type === "text-delta") events.push({ type: ev.type, text: ev.text });
			else if (ev.type === "gate") events.push({ type: ev.type, gate: ev.gate });
			else events.push({ type: ev.type });
		}

		const fullText = events
			.filter((e) => e.type === "text-delta")
			.map((e) => e.text)
			.join("");

		expect(
			events.some((e) => e.type === "gate" && e.gate === "credit"),
			`esperava o gate credit disparar neste turno — eventos: ${JSON.stringify(events)}`,
		).toBe(true);
		expect(
			fullText,
			"a pergunta PRÓPRIA do modelo não pode sobreviver quando pendingFollowUp libera credit no mesmo turno",
		).not.toContain("Quer seguir com a Canopus?");
		expect(fullText).toContain("Perfeito!");
	});
});
