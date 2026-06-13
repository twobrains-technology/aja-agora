/**
 * BUG-LEAD-HISTORY-INCOMPLETE (2026-05-18)
 *
 * Sintoma reportado: no painel admin → pipeline → lead → aba "Conversa"
 * (rota `/api/admin/leads/[id]/conversation`), o histórico vem incompleto.
 * Comparando ao WhatsApp real, faltam três coisas no fluxo final
 * "Simulação de Cota → Tenho interesse! → Handoff":
 *
 *   GAP #1 — Artifacts emitidos pelo agent (Comparativo, Simulação de Cota,
 *            Lead Form, etc.) NUNCA aparecem. messages.artifacts é sempre [].
 *            Tabela `artifacts` existe no schema (src/db/schema.ts:199-207)
 *            mas é DEAD CODE — nenhum `db.insert(artifacts)` no projeto.
 *            Comentário em schema.ts:32 confirma. Runner em
 *            src/lib/agent/orchestrator/runner.ts:198-201 salva só o texto
 *            do assistant, joga fora o array `artifacts`.
 *
 *   GAP #2 — Quando o cliente clica no botão "Tenho interesse!"
 *            (interactive reply), a mensagem do usuário com o replyTitle
 *            NÃO fica persistida. handleInterest (interactive-handlers.ts:356)
 *            é o único handler do arquivo que NÃO chama
 *            `saveMessage(conversationId, "user", replyTitle)` antes de
 *            `startInterestHandoff`. Demais handlers (handleSimulate,
 *            handleDetail, handleHandoffConfirm) salvam.
 *
 *   GAP #3 — A resposta final do bot "Perfeito, <nome>! Já estou passando
 *            seu perfil pro consultor — ele te chama aqui em instantes. 🤝"
 *            NÃO fica salva. Em proxy.ts:359-362, startInterestHandoff
 *            chama `sendTextMessage(userWaId, ...)` direto, sem persistir
 *            via saveMessage. WhatsApp real recebe a mensagem; admin não vê.
 *
 * CONTRATO (anti-regressão): após o cenário completo
 * "agent emite simulation_result → user clica interest_g1 → bot manda
 *  frase de encerramento", o GET admin DEVE retornar:
 *   - >=1 message com artifacts.length > 0 (cobre GAP #1)
 *   - 1 message role=user com content == replyTitle do interest_* (GAP #2)
 *   - 1 message role=assistant contendo "Já estou passando seu perfil pro
 *     consultor" (GAP #3)
 *
 * NÍVEL ESCOLHIDO: integration.
 *   - Por quê: os 3 gaps são FALHA DE PERSISTÊNCIA no Postgres real. Mock
 *     do saveMessage / db esconderia exatamente o bug. Toca DB de verdade.
 *   - Mocks: APENAS borda externa (Meta API: sendTextMessage,
 *     sendInteractiveMessage, sendTypingIndicator) e Anthropic (resolveAgent
 *     stub que emite tool-call determinístico — sem chamada de rede).
 *   - Memory adapter desligado pra evitar Letta sidecar.
 *
 * Mesma estratégia do route.admin-message-persistence.test.ts (ver
 * comentário inicial dele) — copia de mocks consistentes com o projeto.
 *
 * Como rodar (workspace `develop` — container aja-pg-develop:5434):
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5434/aja_agora \
 *     npx vitest run src/lib/whatsapp/lead-history-completeness.test.ts \
 *     --reporter=verbose
 *
 * Por que precisa do DATABASE_URL explícito: vitest.setup.ts carrega `.env`
 * primeiro (DATABASE_URL=:5433) e `.env.local` depois (:5434), mas
 * `loadEnvFile` do node:process NÃO sobrescreve por default. Exportar
 * inline garante 5434 (mesma convenção do tests/regression/agent-trajectory.test.ts).
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks (TÊM que vir antes de qualquer import do código de produção) ─────

// vi.mock hoisting: mocks compartilhados precisam de vi.hoisted.
const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	sendTyping: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
	sendTypingIndicator: mocks.sendTyping,
}));

// `analyzeTurn` faria generateObject contra Anthropic. Como runDirectiveWithOrchestrator
// passa isUserTurn:false E skipAnalyzer:true, ele nem é chamado nesse caminho.
// Ainda assim mockamos pra defesa (caso a flag de análise se perca em algum refator).
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

// `resolveAgent` retorna agent stub que emite UM tool-call de
// `present_simulation_result` SEM text-delta. Isso simula o agent chamando
// a tool de apresentação — o runner gera o event "artifact" e salva a
// mensagem assistant como "[tool: present_simulation_result]" (placeholder
// de turn só-tool, bug-ghost-turn já coberto). O artifact em si fica órfão:
// o runner NÃO insere em `artifacts`. É exatamente o GAP #1.
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
							groupId: "g1",
							creditValue: 30000,
							monthlyPayment: 500,
							adminFee: 1000,
							reserveFund: 100,
							insurance: 100,
							totalCost: 32000,
							termMonths: 60,
							effectiveRate: 2.1,
						},
						toolCallId: "tc-sim-1",
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

// Memory adapter desligado pra evitar Letta no teste.
vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

// ─── Imports do código de produção (após os mocks) ──────────────────────────

const { db } = await import("@/db");
const { conversations, leads, user: userTable } = await import("@/db/schema");
const { runDirectiveWithOrchestrator } = await import("./adapter");
const { processInteractiveReply } = await import("./processor");
const { invalidateAttendantCache } = await import("./proxy");

// ─── Setup helpers ──────────────────────────────────────────────────────────

const FAKE_WA_ID = `SIM-bug-history-${Date.now()}`;
const REPLY_TITLE = "Tenho interesse!";
const REPLY_ID = "interest_g1";

type Lead = {
	id: string;
	conversationId: string;
};

async function seedFixture(): Promise<{
	convId: string;
	lead: Lead;
	attendantId: string;
}> {
	// 1) Atendente ativo (pra startInterestHandoff conseguir notificar)
	const attendantId = `attendant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	await db.insert(userTable).values({
		id: attendantId,
		name: "Atendente Test",
		email: `${attendantId}@test.local`,
		role: "attendant",
		phone: "5511988887777",
		isActive: true,
	});
	// Invalida cache 60s de attendants pra incluir esse no list
	invalidateAttendantCache();

	// 2) Conversation simulada (waId SIM-... isSimulated=true) com category
	//    setada (pra escapar do branch isConcierge=true que dispara welcome).
	//    searchDispatched=true pra que o lead-funnel já esteja em "fase final"
	//    coerente com "em_negociacao".
	const [conv] = await db
		.insert(conversations)
		.values({
			waId: FAKE_WA_ID,
			channel: "whatsapp",
			status: "active",
			contactName: "Marcos Silva",
			isSimulated: true,
			metadata: {
				currentPersona: "moto",
				currentCategory: "moto",
				expertiseLevel: "neutro",
				searchDispatched: true,
				// FIX-WA: cenário pós-reveal — "Tenho interesse" é avanço self-service.
				revealCompleted: true,
				simulatorOfferDispatched: true,
				recommendedAdministradora: "CANOPUS",
			},
		})
		.returning();

	// 3) Lead em stage em_negociacao (cenário do bug é fim do funil)
	const [lead] = await db
		.insert(leads)
		.values({
			conversationId: conv.id,
			name: "Marcos Silva",
			phone: "11999990000",
			email: null,
			stage: "em_negociacao",
			isSimulated: true,
		})
		.returning();

	return { convId: conv.id, lead: { id: lead.id, conversationId: conv.id }, attendantId };
}

async function cleanupFixture(convId: string, attendantId: string): Promise<void> {
	// onDelete cascade em messages/leads/artifacts → basta deletar conversation.
	await db.delete(conversations).where(eq(conversations.id, convId));
	await db.delete(userTable).where(eq(userTable.id, attendantId));
	invalidateAttendantCache();
}

// Replica EXATAMENTE a query do /api/admin/leads/[id]/conversation/route.ts.
// Se a query do route mudar, este helper precisa acompanhar — é o ponto de
// acoplamento do teste com a rota real.
async function fetchAdminHistory(leadId: string): Promise<
	Array<{
		id: string;
		role: "user" | "assistant" | "system";
		content: string;
		artifacts: Array<{ id: string; type: string; payload: Record<string, unknown> }>;
	}>
> {
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
	if (!lead?.conversation) {
		throw new Error(`lead ${leadId} sem conversation no helper de teste`);
	}
	// O tipo retornado pelo Drizzle inclui campos extras (channel, etc.);
	// reduzimos aqui ao que o teste asserta. Cast estreito.
	return lead.conversation.messages.map((m) => ({
		id: m.id,
		role: m.role,
		content: m.content,
		artifacts:
			(
				m as unknown as {
					artifacts: Array<{ id: string; type: string; payload: Record<string, unknown> }>;
				}
			).artifacts ?? [],
	}));
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe("BUG-LEAD-HISTORY-INCOMPLETE + FIX-WA — histórico cobre artifact + clique, e 'Tenho interesse' NÃO vira handoff", () => {
	let convId: string;
	let lead: Lead;
	let attendantId: string;

	beforeEach(async () => {
		mocks.sendText.mockClear();
		mocks.sendInteractive.mockClear();
		mocks.sendTyping.mockClear();
		const seeded = await seedFixture();
		convId = seeded.convId;
		lead = seeded.lead;
		attendantId = seeded.attendantId;
	});

	afterEach(async () => {
		await cleanupFixture(convId, attendantId);
	});

	it("após simulation_result + clique 'Tenho interesse!', histórico tem artifact + clique do user; o clique dirige a DECISÃO (self-service), sem frase de consultor", async () => {
		// ── Passo 1: agent emite present_simulation_result via stub.
		//    runner.ts persiste o assistant + o artifact (GAP #1).
		await runDirectiveWithOrchestrator({
			from: FAKE_WA_ID,
			conversationId: convId,
			directive: "[directive interno: emitir simulação para o grupo g1]",
			contactName: "Marcos Silva",
		});

		// ── Passo 2: usuário clica no botão "Tenho interesse!".
		//    FIX-WA: handleInterest NÃO faz mais startInterestHandoff — persiste o
		//    clique (recordUserClick, GAP #2), marca decisionDispatched e dirige o
		//    card de decisão (mesmo funil self-service da web).
		await processInteractiveReply(FAKE_WA_ID, REPLY_ID, REPLY_TITLE, "Marcos Silva");

		// Sanity-check INVERTIDO: a borda externa (Meta API mockada) NUNCA pode ter
		// recebido a frase de handoff — o "Tenho interesse" é self-service agora.
		const allOutboundTexts = mocks.sendText.mock.calls.map((c) => String(c[1] ?? "")).join(" | ");
		expect(
			allOutboundTexts,
			"FIX-WA: o clique 'Tenho interesse' NÃO pode disparar a frase de handoff pra consultor — é self-service (decisão → contratação).",
		).not.toContain("Já estou passando seu perfil pro consultor");

		// ── Passo 3: busca o histórico exatamente como o admin faz.
		const history = await fetchAdminHistory(lead.id);

		const failures: string[] = [];

		// GAP #1: pelo menos UMA mensagem tem artifact simulation_result (passo 1).
		const simulationArtifacts = history.flatMap((m) =>
			m.artifacts.filter((a) => a.type === "simulation_result"),
		);
		if (simulationArtifacts.length < 1) {
			failures.push(
				`GAP #1 (artifacts órfãos) — esperava >=1 artifact 'simulation_result' persistido, achei ${simulationArtifacts.length}. ` +
					`Tipos achados: ${history.flatMap((m) => m.artifacts.map((a) => a.type)).join(",") || "(nenhum)"}.`,
			);
		}

		// GAP #2: existe message role=user com content == REPLY_TITLE (clique persistido).
		const userInterestMsgs = history.filter((m) => m.role === "user" && m.content === REPLY_TITLE);
		if (userInterestMsgs.length !== 1) {
			failures.push(
				`GAP #2 (clique 'Tenho interesse!' não persistido) — esperava 1 mensagem role=user com content="${REPLY_TITLE}", achei ${userInterestMsgs.length}. ` +
					`Conteúdos user: ${
						history
							.filter((m) => m.role === "user")
							.map((m) => JSON.stringify(m.content))
							.join(", ") || "(nenhuma)"
					}.`,
			);
		}

		// FIX-WA: NENHUMA mensagem promete consultor por "Tenho interesse".
		const consultorMsgs = history.filter((m) => /consultor/i.test(m.content));
		if (consultorMsgs.length > 0) {
			failures.push(
				`FIX-WA (desvio pra consultor) — o clique 'Tenho interesse' não pode gerar mensagem com "consultor". Achei ${consultorMsgs.length}: ${consultorMsgs
					.map((m) => JSON.stringify(m.content.slice(0, 80)))
					.join(", ")}.`,
			);
		}

		expect(
			failures,
			`FIX-WA: ${failures.length} contrato(s) violado(s).\n\n` +
				failures.map((f, i) => `[${i + 1}] ${f}`).join("\n\n"),
		).toEqual([]);

		// O funil avançou pra decisão (determinístico, persistido pelo handler).
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
		expect(meta.decisionDispatched, "handleInterest deve marcar decisionDispatched").toBe(true);
	}, 30_000);
});
