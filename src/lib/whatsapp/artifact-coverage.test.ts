/**
 * Regression test — BUG: simulador WhatsApp não renderiza artifacts (apresentação 13h).
 *
 * Sintoma:
 *   No painel admin/simulator (canal WhatsApp), o agent diz frases como
 *   "Da uma olhada nas opcoes que vou montar pra voce" mas nenhum card aparece.
 *   No web o mesmo turno renderiza corretamente.
 *
 * Causa-raiz (hipotese a confirmar pelos testes):
 *   `PRESENTATION_TOOLS` (src/lib/agent/tools/ai-sdk.ts) expoe 10 tools de
 *   apresentacao. Toda chamada produz um TurnEvent `artifact`. No web,
 *   `artifact-renderer.tsx` cobre todas. No WhatsApp, `artifactToWhatsApp`
 *   (src/lib/whatsapp/formatter.ts) so mapeia 6 tipos — e retorna `null` pros
 *   demais. Em `consumeEvents` (src/lib/whatsapp/adapter.ts:96) o `null` cai num
 *   `continue;` silencioso — o artifact eh DROPADO sem log nem fallback textual.
 *
 *   Tools que o agent chama mas o WhatsApp ENGOLE:
 *     - present_topic_picker         (Bruna v1 #05 / system-prompt mig 0019)
 *     - present_scenarios            (Bruna v1 #16)
 *     - present_financing_comparison (Bruna v1 #17)
 *     - present_whatsapp_optin       (Phase 6)
 *
 *   System prompt diz "nunca prometa opcoes sem chamar tool". O agent obedece
 *   (chama a tool) mas o canal WhatsApp drop silencioso da UI -> usuario ve
 *   apenas a frase "olha as opcoes" sem opcao nenhuma. Exatamente o screenshot.
 *
 * Nivel: integration leve — exercita o consumer real (`consumeEvents`) com um
 *   stream sintetico de events. Nao mocka logica de dominio. Mocka apenas a
 *   borda externa (Meta API via `./api`) pra capturar OQUE seria enviado, sem
 *   depender de WHATSAPP_ACCESS_TOKEN. Mesma estrategia do processor.test.ts
 *   ja existente no repo.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock hoisting workaround (mesma convencao do processor.test.ts).
const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
	sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
}));

// Evita tocar DB real — `consumeEvents` so chama `recordStageReached` em events
// `lead-stage`, que nao emitimos nos cenarios desse teste.
vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/conversation/meta", () => ({
	reloadMeta: vi.fn().mockResolvedValue({ currentCategory: "moto" }),
	persistMeta: vi.fn().mockResolvedValue(undefined),
}));

// Acesso interno via reimport do modulo (nao re-export publico) — usamos
// processWithOrchestrator com um runTurn injetado via mock pra exercitar
// consumeEvents indiretamente.
import * as orchestrator from "@/lib/agent/orchestrator";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { processWithOrchestrator } from "./adapter";
import { artifactToWhatsApp } from "./formatter";

import * as session from "./session";

// Helpers ------------------------------------------------------------------

function artifactEvent(
	artifactType: string,
	payload: Record<string, unknown>,
): Extract<TurnEvent, { type: "artifact" }> {
	return {
		type: "artifact",
		// O ArtifactType de chat/types eh restrito aos 10 valores. Cast estreito
		// pro teste — usamos string literal que existe na uniao.
		artifactType: artifactType as Extract<TurnEvent, { type: "artifact" }>["artifactType"],
		payload,
		toolCallId: `tc-${artifactType}`,
	};
}

async function* makeStream(events: TurnEvent[]): AsyncGenerator<TurnEvent> {
	for (const ev of events) yield ev;
}

// Suite --------------------------------------------------------------------

describe("BUG WhatsApp: artifacts orfaos no canal WhatsApp (apresentacao 13h)", () => {
	const FAKE_FROM = "SIM-test-1234";
	const FAKE_CONV_ID = "00000000-0000-0000-0000-000000000001";

	beforeEach(() => {
		mocks.sendText.mockClear();
		mocks.sendInteractive.mockClear();

		vi.spyOn(session, "getOrCreateConversation").mockResolvedValue({
			id: FAKE_CONV_ID,
			isNew: false,
		} as Awaited<ReturnType<typeof session.getOrCreateConversation>>);
	});

	afterAll(() => {
		vi.restoreAllMocks();
	});

	// ---------------------------------------------------------------------
	// 1. Estrutural: PRESENTATION_TOOLS define o contrato. artifactToWhatsApp
	//    DEVE cobrir 100% das tools. Se nao cobre, qualquer chamada da tool em
	//    canal WhatsApp vira drop silencioso.
	// ---------------------------------------------------------------------
	it("artifactToWhatsApp cobre TODAS as tools listadas em PRESENTATION_TOOLS", () => {
		// Payloads minimos por artifact type — suficiente pro mapper devolver
		// algo (texto OU interactive). Valor exato nao importa aqui; importa eh
		// que retorne != null.
		const samplePayloads: Record<string, Record<string, unknown>> = {
			group_card: {
				id: "g1",
				administradora: "X",
				category: "moto",
				creditValue: 30000,
				monthlyPayment: 500,
				adminFeePercent: 18,
				termMonths: 60,
				availableSlots: 1,
				contemplationRate: 1.2,
			},
			comparison_table: { groups: [] },
			simulation_result: {
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
			recommendation_card: {
				id: "g1",
				administradora: "X",
				category: "moto",
				creditValue: 30000,
				monthlyPayment: 500,
				adminFeePercent: 18,
				termMonths: 60,
				contemplationRate: 1.2,
				score: 0.8,
			},
			lead_form: {},
			value_picker: { category: "moto", fields: [] },
			topic_picker: { topics: ["a", "b"], includeBackButton: true },
			scenarios: { scenarios: {} },
			financing_comparison: { consorcio: {}, financing: {}, diff: {} },
			whatsapp_optin: {},
			embedded_bid: { maxEmbutidoPct: 30, creditValue: 120_000, embeddedBidValue: 36_000, netCredit: 84_000, disclaimer: "x" },
			two_paths: { monthlyPayment: 812, administradora: "X", disclaimer: "x" },
			scarcity: { groupCode: "g1", administradora: "X", availableSlots: 3 },
		};

		// Mapeia tool name (present_X) -> artifact type (X)
		const expectedArtifactTypes = Array.from(PRESENTATION_TOOLS).map((t) =>
			t.replace("present_", ""),
		);

		const missing: string[] = [];
		for (const aType of expectedArtifactTypes) {
			const payload = samplePayloads[aType] ?? {};
			const result = artifactToWhatsApp(aType, payload);
			if (result === null) missing.push(aType);
		}

		expect(missing, `WhatsApp drops these artifacts silently: ${missing.join(", ")}`).toEqual([]);
	});

	// ---------------------------------------------------------------------
	// 2. Integration: stream com topic_picker emitido pelo orchestrator —
	//    consumeEvents DEVE enviar uma interactive message (botoes/lista).
	//    Hoje envia NADA: o artifact eh dropado, e o texto "Da uma olhada nas
	//    opcoes" vai sozinho — reproduzindo o sintoma do screenshot.
	// ---------------------------------------------------------------------
	it("topic_picker emitido pelo agent vira interactive no WhatsApp", async () => {
		const stream = makeStream([
			{ type: "text-delta", text: "Da uma olhada nas opcoes que vou montar pra voce" },
			artifactEvent("topic_picker", {
				prompt: "Sobre o que voce gostaria de saber?",
				topics: ["Como funciona", "Quanto custa", "Lance vs sorteio"],
				includeBackButton: true,
			}),
			{ type: "finish", reason: "ok" },
		]);

		vi.spyOn(orchestrator, "runTurn").mockImplementation(() => stream);

		await processWithOrchestrator(FAKE_FROM, "tenho duvidas", "Marcos");

		// O agent prometeu "opcoes" — TEM que sair interactive message,
		// nao apenas o texto.
		expect(
			mocks.sendInteractive.mock.calls.length,
			"esperado >=1 sendInteractiveMessage (interactive com os topicos clicaveis); recebido 0 — artifact topic_picker foi dropado",
		).toBeGreaterThanOrEqual(1);

		// E o conteudo da interactive precisa conter ALGUM dos topicos enviados
		// pra garantir que nao eh outro interactive nao relacionado.
		const allInteractives = mocks.sendInteractive.mock.calls
			.map((c) => JSON.stringify(c[1]))
			.join(" | ");
		expect(allInteractives).toMatch(/Como funciona|Quanto custa|Lance vs sorteio/);
	});

	// ---------------------------------------------------------------------
	// 3. Integration: scenarios + financing_comparison + whatsapp_optin — todos
	//    deviriam virar interactive OU pelo menos texto formatado. Hoje viram
	//    silencio total.
	// ---------------------------------------------------------------------
	it.each([
		[
			"scenarios",
			{
				groupId: "g1",
				administradora: "Itau",
				creditValue: 30000,
				termMonths: 60,
				scenarios: {
					conservador: {
						lancePercent: 0,
						expectedTermMonths: 36,
						strategy: "Sem lance",
						disclaimer: "Estimativa",
					},
					provavel: {
						lancePercent: 20,
						expectedTermMonths: 18,
						strategy: "20% lance",
						disclaimer: "Estimativa",
					},
					acelerado: {
						lancePercent: 30,
						expectedTermMonths: 6,
						strategy: "30% lance",
						disclaimer: "Estimativa",
					},
				},
			},
		],
		[
			"financing_comparison",
			{
				category: "moto",
				creditValue: 30000,
				termMonths: 60,
				consorcio: { monthlyPayment: 500, totalCost: 32000 },
				financing: { monthlyPayment: 750, totalCost: 45000, annualRate: 28 },
				diff: { monthlyDelta: 250, totalDelta: 13000 },
				disclaimer: "Estimativa",
			},
		],
		["whatsapp_optin", {}],
	])(
		"artifact %s nao eh dropado no WhatsApp (precisa virar texto ou interactive)",
		async (artifactType, payload) => {
			mocks.sendText.mockClear();
			mocks.sendInteractive.mockClear();

			const stream = makeStream([
				{ type: "text-delta", text: "Olha so" },
				artifactEvent(artifactType, payload),
				{ type: "finish", reason: "ok" },
			]);
			vi.spyOn(orchestrator, "runTurn").mockImplementation(() => stream);

			await processWithOrchestrator(FAKE_FROM, "input", "Marcos");

			// Esperado: ALEM do "Olha so" inicial, deve haver pelo menos uma
			// mensagem extra (texto ou interactive) representando o artifact.
			// Hoje so o "Olha so" eh enviado — artifact eh engolido.
			const textsAfterIntro = mocks.sendText.mock.calls.length;
			const interactives = mocks.sendInteractive.mock.calls.length;
			const totalOutbound = textsAfterIntro + interactives;

			expect(
				totalOutbound,
				`esperado >=2 mensagens (texto intro + artifact ${artifactType}); recebido ${totalOutbound} — artifact dropado`,
			).toBeGreaterThanOrEqual(2);
		},
	);
});
