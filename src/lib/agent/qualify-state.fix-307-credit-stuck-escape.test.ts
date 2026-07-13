import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { GATE_STUCK_ESCAPE_THRESHOLD, nextGate, registerGateStuckTurn } from "./qualify-state";

// ============================================================================
// FIX-307 (rodada 10, onda 4 — defesa em profundidade do FIX-306, mesma
// investigação de causa-raiz do cassette Mario) — mesmo se a promoção pontual
// do FIX-306 (desire respondido AGORA com valor junto) não cobrir 100% dos
// casos reais, o gate `credit` não pode travar pra sempre quando já existe um
// valor mencionado (`qualifyAnswers.creditMentionedAtDesire`). `credit` foi
// DELIBERADAMENTE excluído do `STUCK_ESCAPE_GATES` (qualify-state.ts) — "não
// fabricar dado financeiro" — mas usar um valor que o usuário JÁ mencionou não
// é fabricar. Escape CONDICIONAL: mesmo N (`GATE_STUCK_ESCAPE_THRESHOLD`, já
// usado pelo FIX-305 pro gate `timeframe`) e mesmo mecanismo
// (`registerGateStuckTurn`/`gateStuckTurns`), mas só ativa quando
// `creditMentionedAtDesire` existe. Sem o valor mencionado, `credit` continua
// SEM escape — preserva o comportamento correto de nunca fabricar dado
// financeiro do zero.
// ============================================================================

const atCreditGate = (over: Partial<ConversationMetadata> = {}): ConversationMetadata => ({
	desireAsked: true,
	currentCategory: "auto",
	qualifyAnswers: {},
	...over,
});

describe("FIX-307 — escape condicional do gate `credit` quando travado com valor já mencionado", () => {
	it(`gate credit travado ${GATE_STUCK_ESCAPE_THRESHOLD}x COM creditMentionedAtDesire → promove pra creditMax e o funil AVANÇA`, () => {
		let meta = atCreditGate({ qualifyAnswers: { creditMentionedAtDesire: 90_000 } });
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD; i++) {
			const gate = nextGate(meta, { hasContactName: true });
			expect(gate, `turno ${i + 1}`).toBe("credit");
			const patch = registerGateStuckTurn(meta, gate);
			expect(patch, `turno ${i + 1}`).not.toBeNull();
			meta = { ...meta, ...patch };
		}
		expect(meta.qualifyAnswers?.creditMax).toBe(90_000);
		expect(meta.gateDefaultsAssumed?.credit).toBe(true);
		expect(meta.gateStuckTurns?.credit).toBe(0);
		expect(nextGate(meta, { hasContactName: true })).not.toBe("credit");
		expect(nextGate(meta, { hasContactName: true })).toBe("identify");
	});

	it(`gate credit travado ${GATE_STUCK_ESCAPE_THRESHOLD + 2}x SEM nenhum valor mencionado → continua travado pra sempre (nunca fabrica dado financeiro)`, () => {
		let meta = atCreditGate();
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD + 2; i++) {
			const gate = nextGate(meta, { hasContactName: true });
			expect(gate, `turno ${i + 1}`).toBe("credit");
			const patch = registerGateStuckTurn(meta, gate);
			expect(patch, `turno ${i + 1}`).toBeNull();
			meta = patch ? { ...meta, ...patch } : meta;
		}
		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
		expect(nextGate(meta, { hasContactName: true })).toBe("credit");
	});

	it(`após ${GATE_STUCK_ESCAPE_THRESHOLD - 1} turnos travado COM valor mencionado, ainda NÃO assume (dá a última chance, mesmo padrão do FIX-305)`, () => {
		let meta = atCreditGate({ qualifyAnswers: { creditMentionedAtDesire: 90_000 } });
		for (let i = 0; i < GATE_STUCK_ESCAPE_THRESHOLD - 1; i++) {
			const patch = registerGateStuckTurn(meta, "credit");
			expect(patch, `tentativa ${i + 1}`).not.toBeNull();
			meta = { ...meta, ...patch };
		}
		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
		expect(nextGate(meta, { hasContactName: true })).toBe("credit");
	});

	it("regressão FIX-305: os outros gates com escape (timeframe/lance/lance-value/lance-embutido) continuam intocados", () => {
		const meta = atCreditGate({
			desireAsked: true,
			currentCategory: "auto",
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			recoConsentDispatched: true,
			experiencePrev: "first",
			qualifyAnswers: { creditMax: 80_000 },
		});
		expect(nextGate(meta, { hasContactName: true })).toBe("timeframe");
		const patch = registerGateStuckTurn(meta, "timeframe");
		expect(patch).toEqual({ gateStuckTurns: { timeframe: 1 } });
	});

	it("registerGateStuckTurn devolve null pra identify/search/decision (fora da classe de escape, com ou sem valor mencionado)", () => {
		const meta = atCreditGate({ qualifyAnswers: { creditMentionedAtDesire: 90_000 } });
		expect(registerGateStuckTurn(meta, "identify")).toBeNull();
		expect(registerGateStuckTurn(meta, "search")).toBeNull();
		expect(registerGateStuckTurn(meta, "decision")).toBeNull();
	});
});
