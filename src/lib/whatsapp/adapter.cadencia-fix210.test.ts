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
	it("gate identify → 2 balões (contexto docx+LGPD, depois pedido do CPF), não 1 bolha", async () => {
		// A reação do LLM é SUBSTITUÍDA pelo contexto fixo (o gancho docx nunca some).
		const reacaoLLM = "REACAO_DO_LLM_DESCARTAVEL_XYZ";
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "text-delta", text: reacaoLLM },
				{ type: "gate", gate: "identify", prefix: reacaoLLM },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "Bora!");

		// DOIS balões deliberados — contexto e pedido em bolhas separadas.
		expect(mocks.sendText).toHaveBeenCalledTimes(2);
		const balao1 = mocks.sendText.mock.calls[0]?.[1] as string;
		const balao2 = mocks.sendText.mock.calls[1]?.[1] as string;
		// Balão 1: contexto fixo com o gancho docx + LGPD (garantido, não do LLM).
		expect(balao1).toMatch(/administradoras/i);
		expect(balao1).toMatch(/aderentes ao seu perfil/i);
		expect(balao1).toMatch(/lgpd/i);
		// Balão 2: o pedido do CPF sai como beat PRÓPRIO — sem o contexto colado.
		expect(balao2).toMatch(/cpf/i);
		expect(balao2).not.toMatch(/administradoras/i);
		// A reação do LLM foi descartada — não vira uma 3ª bolha.
		for (const call of mocks.sendText.mock.calls) {
			expect(call[1]).not.toContain(reacaoLLM);
		}
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
