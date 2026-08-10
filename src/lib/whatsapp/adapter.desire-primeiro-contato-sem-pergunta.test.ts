// Achado em PRODUÇÃO (conversa 3dbe48c5, 2026-08-04 15:23:38) — o primeiro
// turno da venda no WhatsApp sai SEM pergunta nenhuma.
//
//   cliente:  "Oi"
//   agente:   "Oi, Kairo! Tudo certo?"        ← e acabou o turno
//   log:      [gate-undelivered] gate=desire — SEM entrega no WhatsApp
//             (nem interactive nem texto); turno pode fechar mudo
//   cliente:  "Tudo e voce"                    ← 14s gastos em cortesia
//
// ⚠️ A CAUSA é ESTRUTURAL, não é o `modelAsked`:
//
//   1. `desire` é o gate que DESCOBRE a categoria (carro/moto/imóvel).
//   2. Mas a pergunta dele (`gate-questions.ts:113`) é
//        `category ? DESIRE_QUESTIONS[category] : null`
//      — ou seja, só existe SE A CATEGORIA JÁ FOR CONHECIDA.
//   3. No primeiro contato a categoria é, por definição, desconhecida → null.
//   4. E `desire` também não tem interactive (`adapter.ts:135` → null).
//
// Dependência circular: no único momento em que o gate `desire` faz sentido,
// ele não tem NADA para entregar. Nem card, nem texto.
//
// Isto NÃO colide com a reversão consciente do FIX-349 (2026-07-21,
// `WHATSAPP_GATES_WITHOUT_FALLBACK` vazio de propósito): lá o problema era a
// canônica DUPLICANDO a pergunta do modelo, e a decisão foi deixar o modelo
// falar. Aqui é o contrário — não há canônica nenhuma para duplicar. O teste
// prova isso fixando `modelAsked: false`, que é exatamente o caminho que
// `adapter.fix-349-reco-consent-silencioso.test.ts` preserva como "a canônica
// SAI, sem regressão".
//
// O que se assere é TRAJETÓRIA (o turno entregou alguma pergunta ao cliente?),
// nunca prosa: o que o agente diz continua sendo dele.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";

const CONV_ID = "conv-desire-primeiro-contato";
const WA = "5562992496793";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	reloadMeta: vi.fn(),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	getOrCreateConversation: vi.fn(),
	runTurn: vi.fn(),
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
vi.mock("@/lib/agent/orchestrator", () => ({ runTurn: mocks.runTurn }));
vi.mock("@/lib/telemetry/turn-trace", () => ({
	traceTurnEvents: (events: AsyncIterable<TurnEvent>) => events,
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { processWithOrchestrator, WHATSAPP_INTERACTIVE_GATES } from "./adapter";

async function* emit(events: TurnEvent[]): AsyncGenerator<TurnEvent> {
	for (const ev of events) yield ev;
}

/** Estado do PRIMEIRO contato: o cliente só disse "Oi". Nada se sabe dele —
 * nem categoria, nem valor. É este o estado em que o gate `desire` dispara. */
const PRIMEIRO_CONTATO = {} as Record<string, unknown>;

beforeEach(() => {
	for (const m of [mocks.sendText, mocks.sendInteractive, mocks.persistMeta]) m.mockClear();
	mocks.getOrCreateConversation.mockResolvedValue({ id: CONV_ID });
	mocks.reloadMeta.mockResolvedValue(PRIMEIRO_CONTATO);
});

afterEach(() => vi.clearAllMocks());

describe("WhatsApp — o primeiro turno abre o funil", () => {
	it("o gate 'desire' tem ALGUMA forma de entrega no primeiro contato", () => {
		// A CAUSA, isolada das duas fontes possíveis de entrega do canal
		// (`adapter.ts:502` interactive, `:533` texto). No primeiro contato não
		// existe categoria — é justamente o que o gate `desire` vai descobrir.
		const pergunta = gateQuestion("desire", null, undefined, "whatsapp");
		const temCard = WHATSAPP_INTERACTIVE_GATES.has("desire");

		expect(
			pergunta !== null || temCard,
			`o gate 'desire' não tem NENHUMA forma de entrega sem categoria:\n` +
				`  gateQuestion("desire", null) = ${JSON.stringify(pergunta)}\n` +
				`  tem card interativo = ${temCard}\n` +
				`E a categoria é exatamente o que este gate existe pra descobrir — ` +
				`a pergunta dele nunca pode depender dela (gate-questions.ts:113).`,
		).toBe(true);
	});

	it("a pergunta entregue é sobre o QUE ele quer, não cortesia", async () => {
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "text-delta", text: "Oi, Kairo! Tudo certo?" },
				{ type: "gate", gate: "desire", modelAsked: false },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "Oi");

		const tudo = [
			...mocks.sendText.mock.calls.map((c) => c[1] as string),
			...mocks.sendInteractive.mock.calls.map((c) => JSON.stringify(c[1])),
		].join(" | ");

		// "Tudo certo?" é cortesia — o system-prompt PROÍBE gastar turno com ela
		// (system-prompt.ts:40). O que tem que sair é a pergunta que move o funil:
		// categoria (carro/moto/imóvel) ou o bem desejado.
		expect(
			/carro|moto|im[óo]vel|apartamento|casa|o que voc[êe]|qual.*(bem|sonho|objetivo)/i.test(tudo),
			`nenhuma pergunta de funil foi entregue no primeiro turno.\nenviado: ${tudo}`,
		).toBe(true);
	});
});
