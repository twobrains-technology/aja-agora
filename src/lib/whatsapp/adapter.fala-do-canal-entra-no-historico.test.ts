// O que o canal manda ao cliente TEM que existir para o modelo.
//
// Produção, `fa0533a0-…`, 13/08/2026 23:33:43. O log registra
// `[gate-delivery] conv=fa0533a0 gate=credit via=text`: o adapter enviou ao
// cliente a pergunta enlatada do gate credit que, com
// `creditMentionedAtDesire = 1500000`, diz *"Uns R$ 1.500.000 então, é isso?"*
// — numa conversa sobre uma moto de R$ 20 mil.
//
// Essa mensagem não foi persistida (`sendText` sem `saveMessage`), logo não
// entrou no histórico. No turno seguinte o cliente respondeu a ela — "ta maluco
// 1.5m numa moto?" — e o modelo, **cego à pergunta que o próprio sistema tinha
// feito em seu nome**, tratou a confusão como sendo dele: "Ahahah, verdade!
// Confundi aqui".
//
// O agente foi acusado de alucinar um valor que ele nunca disse. Quem disse foi
// o servidor, pelas costas dele.
//
// A regra que isto trava: mensagem que o canal entrega ao cliente é fala da
// conversa — vai para `messages` como qualquer outra, e volta no histórico.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";

const CONV_ID = "conv-fala-do-canal";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	reloadMeta: vi.fn(),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	getOrCreateConversation: vi.fn(),
	runTurn: vi.fn(),
	saveMessage: vi.fn().mockResolvedValue("msg-id"),
}));

vi.mock("./once", () => ({
	claimOnce: vi.fn().mockResolvedValue(true),
	claimInboundMessage: vi.fn().mockResolvedValue(true),
	claimContextBeat: vi.fn().mockResolvedValue(true),
	claimButtonClick: vi.fn().mockResolvedValue(true),
	DOUBLE_CLICK_WINDOW_MS: 12000,
}));
vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("./session", () => ({ getOrCreateConversation: mocks.getOrCreateConversation }));
vi.mock("@/lib/conversation/meta", () => ({
	reloadMeta: mocks.reloadMeta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/agent/orchestrator", () => ({ runTurn: mocks.runTurn }));
vi.mock("@/lib/telemetry/turn-trace", () => ({
	traceTurnEvents: (events: AsyncIterable<TurnEvent>) => events,
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

import { processWithOrchestrator } from "./adapter";

async function* emit(events: TurnEvent[]): AsyncGenerator<TurnEvent> {
	for (const ev of events) yield ev;
}

beforeEach(() => {
	for (const m of [mocks.sendText, mocks.sendInteractive, mocks.persistMeta, mocks.saveMessage]) {
		m.mockClear();
	}
	mocks.getOrCreateConversation.mockResolvedValue({ id: CONV_ID });
	mocks.reloadMeta.mockResolvedValue({
		currentCategory: "moto",
		currentPersona: "moto",
		desireAsked: true,
		desireAnswered: true,
		qualifyAnswers: { creditMentionedAtDesire: 20_000 },
	});
});

afterEach(() => vi.clearAllMocks());

describe("a pergunta que o canal envia entra no histórico", () => {
	it("gate entregue por TEXTO é persistido como fala do assistente", async () => {
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "text-delta", text: "Beleza!" },
				{ type: "gate", gate: "credit", modelAsked: false },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "quero uma moto");

		const enviados = mocks.sendText.mock.calls.map((c) => c[1] as string);
		const perguntaDoGate = enviados.find((t) => /valor|quanto|R\$/i.test(t));
		expect(perguntaDoGate, `nada de gate foi enviado: ${JSON.stringify(enviados)}`).toBeTruthy();

		// O ponto do teste: o que saiu para o cliente existe em `messages`.
		const persistidos = mocks.saveMessage.mock.calls.map((c) => String(c[2]));
		expect(
			persistidos.some((t) => t === perguntaDoGate),
			`o canal enviou "${perguntaDoGate}" e nada disso foi persistido: ${JSON.stringify(persistidos)}`,
		).toBe(true);
	});

	it("é gravado como assistant, no canal whatsapp", async () => {
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "gate", gate: "credit", modelAsked: false },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "quero uma moto");

		const chamada = mocks.saveMessage.mock.calls.find((c) => c[1] === "assistant");
		expect(chamada, "nenhuma fala do canal foi gravada como assistant").toBeTruthy();
		expect(chamada?.[3]).toBe("whatsapp");
	});
});
