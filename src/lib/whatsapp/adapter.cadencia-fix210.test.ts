// Camada 1 (FIX-210) — cadência 2-tempos na entrega de gate + identify unificado.
//
// Kairo (reforma de conversa WhatsApp, 2026-07-02): "essa mensagem aqui tem que
// ser cadenciada. explica, depois manda uma: me informa seu cpf". No consent→
// identify o funil mandava UMA bolha longa (reação + porquê + LGPD + pedido do
// CPF), porque o adapter colava o `prefix` (texto do LLM) na pergunta do gate.
//
// Trava (C1 do spec): quando o gate carrega contexto (prefix do LLM), o WhatsApp
// emite DOIS balões — contexto curto primeiro, pedido do gate depois — NÃO uma
// bolha só. E o identify tem UM texto só, curto, sem "CPF e celular".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";

const CONV_ID = "conv-cadencia-210";
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
// tap passthrough — a telemetria não deve tocar o comportamento nem o DB no teste.
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
	mocks.reloadMeta.mockResolvedValue({ currentCategory: "auto", currentPersona: "helena-auto" });
});

afterEach(() => vi.clearAllMocks());

describe("FIX-210 — cadência 2-tempos: contexto e pedido em balões SEPARADOS", () => {
	it("gate identify com fala do modelo → a fala do modelo SOBREVIVE e o contexto+pedido saem em balões próprios", async () => {
		// 2026-07-20 (auditoria multicanal): este ramo APAGAVA o texto do modelo
		// (`textBuffer = ""`) pra colar o beat fixo. O cliente perguntava "por que
		// você precisa do meu CPF?", o modelo escrevia a explicação, e o canal
		// jogava a explicação fora e mandava os mesmos 2 balões enlatados de sempre.
		// Invariante novo: a fala do modelo nunca é apagada; o beat determinístico
		// (LGPD) continua saindo, mas UMA vez por conversa e SEM comer a conversa.
		const reacaoLLM = "Claro! Te explico: é pra eu conseguir consultar as simulações reais.";
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "text-delta", text: reacaoLLM },
				{ type: "gate", gate: "identify", prefix: reacaoLLM },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "por que você precisa do meu CPF?");

		const baloes = mocks.sendText.mock.calls.map((c) => c[1] as string);
		// A fala do modelo saiu — não foi substituída por texto enlatado.
		expect(baloes[0]).toContain(reacaoLLM);
		// O contexto fixo (gancho docx + LGPD) continua sendo entregue, em balão próprio.
		const contexto = baloes.find((t) => /lgpd/i.test(t));
		expect(contexto).toBeDefined();
		expect(contexto).toMatch(/administradoras/i);
		expect(contexto).toMatch(/aderentes ao seu perfil/i);
		// E o pedido do CPF é um beat PRÓPRIO — nunca colado no contexto.
		const pedido = baloes.at(-1) as string;
		expect(pedido).toMatch(/cpf/i);
		expect(pedido).not.toMatch(/administradoras/i);
	});

	it("gate identify sem reação do LLM → ainda 2 balões (contexto fixo + pedido)", async () => {
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "gate", gate: "identify" },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "oi");

		expect(mocks.sendText).toHaveBeenCalledTimes(2);
		expect(mocks.sendText.mock.calls[0]?.[1]).toMatch(/administradoras/i);
		expect(mocks.sendText.mock.calls[1]?.[1]).toMatch(/cpf/i);
	});
});

describe("FIX-210 — identify unificado num texto só, curto, sem 'CPF e celular'", () => {
	it("IDENTIFY_WHATSAPP_PROMPT e gateQuestion('identify') são a MESMA copy", async () => {
		const { IDENTIFY_WHATSAPP_PROMPT } = await import("./identify-capture");
		expect(IDENTIFY_WHATSAPP_PROMPT).toBe(gateQuestion("identify"));
	});

	it("o pedido é curto (≤ 160 chars) e não pede 'CPF e celular' (só o CPF)", () => {
		const q = gateQuestion("identify") ?? "";
		expect(q.length).toBeLessThanOrEqual(160);
		expect(q).not.toMatch(/cpf e celular/i);
		expect(q).toMatch(/cpf/i);
	});
});
