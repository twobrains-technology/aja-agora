// Integration (DB real) — FIX-343 (P0, veredito rodada 2 do loop
// "desamarra-agente", 3/10, D2=2/10): o fallback enlatado
// (`buildToolErrorRecoveryFallback`, "as opções que já apareceram aqui pra
// você continuam valendo...") ainda dispara em 5 dos 8 dossiês, byte-a-byte,
// mesmo depois do FIX-332 (rodada 1) ter liberado search_groups/
// recommend_groups pós-reveal.
//
// Root cause PROVADA por leitura de código + correlação byte-a-byte com o
// dossiê `moto-web.md` (rodada 2, turno 15): `dispatchDecisionCascade`
// (orchestrator/index.ts) roda dois sub-turnos PURAMENTE NARRATIVOS
// (scarcity + decision/so_parcela) via `runTurn({ isUserTurn: false, ... })`
// SEM `forceToolChoice: "none"` — o directive proíbe "NÃO chame NENHUMA
// tool" só em TEXTO de prompt (regra-no-prompt, não invariante em código).
// Quando o modelo desobedece e tenta uma tool removida do toolset
// (present_two_paths/present_decision_prompt, server-side-only desde
// FIX-246/253), o AI SDK emite `tool-error` (NoSuchToolError) → o runner
// descarta TODA a fala do sub-turno → o orchestrator materializa o fallback
// "as opções que já apareceram..." — texto sem sentido nenhum aqui (não há
// pergunta de usuário sobre oferta pra resolver, é um sub-turno de
// transição). Pior: `dispatchDecisionCascade` NÃO verifica o resultado do
// `yield* runTurn(...)` interno — ela continua incondicionalmente e cola o
// card+texto determinístico da cascata (two_paths + TWO_PATHS_FOLLOWUP_TEXT)
// logo depois do fallback, produzindo o texto "Frankenstein" visto no
// dossiê: "Perfeito, Mario. Então deixa eu confirmar com você: Mario, as
// opções que já apareceram aqui pra você continuam valendo... Não tem certo
// ou errado — depende de você ter pressa ou não."
//
// O MESMO defeito estrutural (tool-call fora de fase num sub-turno
// narrativo) já tinha sido encontrado e corrigido pelo FIX-319 (rodada 10)
// no caminho IRMÃO — `pipeClosingCeremony` (src/app/api/chat/route.ts),
// usado quando o usuário avança por CLIQUE — via `forceToolChoice: "none"`
// (já suportado por TurnInput/runner/builder, ToolChoice "none" do AI SDK 6:
// proíbe qualquer tool-call em nível de API, nunca regra-no-prompt). Só
// faltou aplicar o MESMO fix no caminho TEXTO (`dispatchDecisionCascade`,
// exercido quando o usuário confirma por texto livre em vez de clicar — o
// caminho exato do dossiê moto-web).
//
// Este teste reproduz o cenário so_parcela (moto-web t15: "não quero
// comprometer além da parcela" + confirmação final por TEXTO). O mock de
// resolveAgent decide o comportamento do "modelo" a partir de
// `opts.toolChoice` — exatamente o eixo que este fix muda: SEM
// `forceToolChoice: "none"` (hoje), o modelo tenta `present_two_paths` fora
// de fase (reproduz o tool-error real); COM (pós-fix), o AI SDK nem deixa o
// modelo tentar — só narra, como o directive pede. Skip sem DB.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Marcador literal do directive de so_parcela (directives.ts,
// buildLanceSoParcelaDirective) — usado pelo mock pra distinguir o sub-turno
// NARRATIVO interno (dispatchDecisionCascade) do turno externo normal
// (o usuário confirmando "vamos com a Canopus").
const SO_PARCELA_DIRECTIVE_MARKER = "dois caminhos possíveis";

vi.mock("@/lib/agent/agents", () => {
	// biome-ignore lint/suspicious/noExplicitAny: mock deliberadamente frouxo — só precisa do formato que runner.ts consome.
	function makeAgent(opts: any) {
		return {
			stream: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
				const lastUser = [...messages].reverse().find((m) => m.role === "user");
				const isDirectiveTurn = Boolean(lastUser?.content?.includes(SO_PARCELA_DIRECTIVE_MARKER));
				return {
					fullStream: (async function* () {
						if (!isDirectiveTurn) {
							// Turno EXTERNO (usuário confirmou por texto) — modelo bem
							// comportado, sem tool-call nenhuma.
							yield {
								type: "text-delta",
								id: "s0",
								text: "Show, Mario! Bora seguir com a Canopus então.",
							};
							return;
						}
						if (opts?.toolChoice === "none") {
							// PÓS-FIX: forceToolChoice:"none" barra qualquer tool-call em
							// nível de API — o modelo só narra, como o directive pede.
							yield {
								type: "text-delta",
								id: "s1",
								text: "Perfeito, respeito total. Então deixa eu ser bem transparente e te mostrar os dois caminhos possíveis:",
							};
							return;
						}
						// HOJE (bug): sem forceToolChoice:"none", o modelo desobedece a
						// regra-no-prompt ("NÃO chame NENHUMA tool") e tenta o card que
						// ACHA que precisa chamar — present_two_paths nunca esteve no
						// toolset (server-side-only, FIX-246) → NoSuchToolError real.
						yield {
							type: "text-delta",
							id: "s1",
							text: "Perfeito, Mario. Então deixa eu confirmar com você:",
						};
						yield {
							type: "tool-call",
							toolName: "present_two_paths",
							input: {},
							toolCallId: "tc-err",
						};
						yield {
							type: "tool-error",
							toolCallId: "tc-err",
							toolName: "present_two_paths",
							input: {},
							error: new Error("Model tried to call unavailable tool 'present_two_paths'."),
						};
					})(),
					finishReason: Promise.resolve("tool-calls" as const),
					providerMetadata: Promise.resolve({}),
				};
			},
		};
	}

	return {
		// biome-ignore lint/suspicious/noExplicitAny: opts real é ResolveAgentOpts — mock só precisa do campo toolChoice.
		resolveAgent: vi.fn((_persona: unknown, _meta: unknown, opts: any) =>
			Promise.resolve(makeAgent(opts)),
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

const { db } = await import("@/db");
const { conversations } = await import("@/db/schema");
const { runTurn } = await import("@/lib/agent/orchestrator");
const { buildToolErrorRecoveryFallback, TWO_PATHS_FOLLOWUP_TEXT } = await import("./directives");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

// Espelha moto-web (rodada 2, t8+t15): "não quero comprometer além da
// parcela" (hasLance="so_parcela") capturado ANTES do reveal, reveal já
// completo, decisão ainda não disparada — o usuário confirma por TEXTO
// LIVRE ("é isso mesmo, vamos com a Canopus"), disparando
// nextGateToFire==="decision" → dispatchDecisionCascade (ramo so_parcela).
const SO_PARCELA_META: ConversationMetadata = {
	currentPersona: "moto",
	currentCategory: "moto",
	expertiseLevel: "neutro",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	desireAsked: true,
	searchDispatched: true,
	revealCompleted: true,
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	recommendedAdministradora: "CANOPUS",
	recommendedOffer: {
		administradora: "CANOPUS",
		creditValue: 35_000,
		termMonths: 60,
		monthlyPayment: 475.93,
		groupId: "grp-canopus",
	},
	qualifyAnswers: {
		creditMin: 30_000,
		creditMax: 40_000,
		prazoMeses: 60,
		hasLance: "so_parcela",
	},
};

async function seedConversation(meta: ConversationMetadata): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ contactName: "Mario", metadata: meta })
		.returning();
	return c.id;
}

async function cleanup(convId: string): Promise<void> {
	const { messages: messagesTable, artifacts: artifactsTable } = await import("@/db/schema");
	const { inArray } = await import("drizzle-orm");
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

async function drainUserTurn(conversationId: string, userText: string): Promise<string> {
	let text = "";
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Mario",
		// Bypassa o analyzer real (heurística/LLM de intent) — o teste não
		// quer testar classificação de intenção, só o eixo do tool-error
		// dentro do sub-turno narrativo. ready_to_proceed é o intent real que
		// o dossiê mostra pra "é isso mesmo, vamos com a Canopus".
		skipAnalyzer: true,
		userIntent: "ready_to_proceed",
	});
	for await (const ev of gen) {
		if (ev.type === "text-delta") text += ev.text;
	}
	return text;
}

describeIfDb(
	"FIX-343 — tool-error dentro do sub-turno narrativo (dispatchDecisionCascade) não vaza o fallback enlatado",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it('confirmação por texto no ramo so_parcela NUNCA produz o fallback "já apareceram" nem o texto Frankenstein colado no card determinístico', async () => {
			convId = await seedConversation(SO_PARCELA_META);

			const text = await drainUserTurn(convId, "é isso mesmo, vamos com a Canopus");

			// Assinatura do fallback enlatado — escrito pra responder uma
			// pergunta de usuário sobre oferta, não pra aparecer num sub-turno
			// de transição sem pergunta nenhuma no ar.
			expect(text).not.toMatch(/continua(m)? valendo/i);
			expect(text).not.toMatch(/me diz o nome da administradora/i);
			expect(text).not.toBe(buildToolErrorRecoveryFallback({ name: "Mario" }));
			// A cascata determinística (two_paths) segue intacta — o convite
			// pra decidir continua saindo, só sem o lixo colado antes dele.
			expect(text).toMatch(
				new RegExp(TWO_PATHS_FOLLOWUP_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
			);
		});
	},
);
