// FIX-349 (P1.2, veredito rodada 4, loop-de-goal desamarra) — em
// `servicos-whatsapp` (rodada 4) o gate `reco-consent` ("Posso te mostrar a
// opção que eu recomendo?") NUNCA aparece na conversa inteira, mesmo o
// servidor marcando `recoConsentDispatched=true`. Root cause provado
// (`sanitizer.ts` EphemeralTextFilter.hasHeldQuestion() + `runner.ts` preview):
// `modelAskedGateQuestion` vira `true` sempre que a ÚLTIMA sentença do MODELO
// termina em QUALQUER pergunta (heurística cega — não checa se a pergunta tem
// ALGUMA relação com o gate corrente). No dossiê real, o modelo fecha o turno
// com "Bora ver essas três opções que achei pra você?" (uma pergunta sobre a
// comparison_table, não sobre o consentimento) e isso already basta pra marcar
// `modelAsked=true`.
//
// Pra gates com interactive/card de fallback (experience/timeframe/etc), um
// falso positivo aqui é inofensivo — o card aparece com corpo neutro. Mas
// `reco-consent` é TEXT-ONLY no WhatsApp (`gateInteractive` devolve null,
// WHATSAPP_TEXT_GATES) — `whatsapp/adapter.ts` (`gateTextPrompt`) aplica
// `ev.modelAsked ? null : gateQuestion(...)`, e sem card nenhum, isso apaga o
// gate por completo: nem interactive, nem texto — só o `console.error`
// "[gate-undelivered]". O usuário nunca é perguntado; `recoConsentAnswered`
// só é resolvido (mais tarde) por um clique/menção que "passa" como
// consentimento implícito — nunca por resposta a uma pergunta que ele viu.
//
// Fix: para gates SEM NENHUM fallback estrutural (nem interactive, nem texto
// alternativo), o `modelAsked` nunca pode apagar a ÚNICA forma de entrega —
// a pergunta canônica sempre sai quando não há outro jeito de representar o
// gate.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";

const CONV_ID = "conv-fix349-reco-consent";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	reloadMeta: vi.fn(),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	getOrCreateConversation: vi.fn(),
	runTurn: vi.fn(),
}));

// Idempotência do canal (src/lib/whatsapp/once.ts) fala com o Postgres — nos
// testes de unidade ela é sempre "pode" — o que se prova aqui é a ENTREGA, não a
// idempotência.
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

import { processWithOrchestrator } from "./adapter";

async function* emit(events: TurnEvent[]): AsyncGenerator<TurnEvent> {
	for (const ev of events) yield ev;
}

beforeEach(() => {
	for (const m of [mocks.sendText, mocks.sendInteractive, mocks.persistMeta]) m.mockClear();
	mocks.getOrCreateConversation.mockResolvedValue({ id: CONV_ID });
	mocks.reloadMeta.mockResolvedValue({
		currentCategory: "servicos",
		currentPersona: "thiago-servicos",
		recoConsentDispatched: true,
	});
});

afterEach(() => vi.clearAllMocks());

// 2026-07-21 — REVERSÃO CONSCIENTE do FIX-349 (ver `WHATSAPP_GATES_WITHOUT_FALLBACK`,
// hoje vazio): `modelAsked` deixou de ser heurística ("terminou com ALGUMA
// pergunta") e passou a ser o sinal REAL do sanitizer. Com o sinal confiável,
// colar a pergunta canônica por cima da pergunta do modelo só produzia o balão
// duplicado visto ao vivo. Gate não respondido volta no turno seguinte.
describe("WhatsApp — a pergunta do modelo não é duplicada pela canônica do gate", () => {
	it("modelAsked=true → o canal NÃO cola a pergunta canônica em cima da do modelo", async () => {
		mocks.runTurn.mockReturnValue(
			emit([
				{
					type: "text-delta",
					text: "Bora ver essas três opções que achei pra você?",
				},
				{ type: "gate", gate: "reco-consent", modelAsked: true },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "É a primeira vez");

		const allText = mocks.sendText.mock.calls.map((c) => c[1] as string).join(" | ");
		expect(allText).toMatch(/bora ver essas três opções/i);
		expect(allText).not.toMatch(/posso te mostrar a opção que eu recomendo/i);
	});

	it("modelAsked=false segue funcionando normalmente (canônica sai, sem regressão)", async () => {
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "gate", gate: "reco-consent", modelAsked: false },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "beleza");

		const allText = mocks.sendText.mock.calls.map((c) => c[1] as string).join(" | ");
		expect(allText).toMatch(/posso te mostrar a opção que eu recomendo/i);
	});
});
