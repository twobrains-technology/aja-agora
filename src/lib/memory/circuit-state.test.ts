// src/lib/memory/circuit-state.test.ts
//
// Unit tests pro circuit breaker. Plano §3.x — equivalente ao request da Fase 1.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	getLettaCircuitState,
	isLettaCircuitOpen,
	markLettaFailure,
	markLettaSuccess,
	resetLettaCircuit,
} from "./circuit-state";

describe("circuit-state", () => {
	beforeEach(() => {
		resetLettaCircuit();
	});

	afterEach(() => {
		vi.useRealTimers();
		resetLettaCircuit();
	});

	it("inicialmente fechado", () => {
		expect(isLettaCircuitOpen()).toBe(false);
		expect(getLettaCircuitState().consecutiveFailures).toBe(0);
	});

	it("1 falha NÃO abre circuito (threshold=2)", () => {
		markLettaFailure("first error");
		expect(isLettaCircuitOpen()).toBe(false);
		expect(getLettaCircuitState().consecutiveFailures).toBe(1);
	});

	it("2 falhas consecutivas abrem circuito", () => {
		markLettaFailure("err1");
		markLettaFailure("err2");
		expect(isLettaCircuitOpen()).toBe(true);
		expect(getLettaCircuitState().consecutiveFailures).toBe(2);
	});

	it("success reseta contador de falhas e fecha circuito", () => {
		markLettaFailure("err1");
		markLettaFailure("err2");
		expect(isLettaCircuitOpen()).toBe(true);
		markLettaSuccess();
		expect(isLettaCircuitOpen()).toBe(false);
		expect(getLettaCircuitState().consecutiveFailures).toBe(0);
	});

	it("circuito half-open após 60s permite probe (retorna false em isOpen)", () => {
		vi.useFakeTimers();
		const start = new Date("2026-05-16T12:00:00.000Z");
		vi.setSystemTime(start);

		markLettaFailure("err1");
		markLettaFailure("err2");
		expect(isLettaCircuitOpen()).toBe(true);

		// Avança 60s + 1ms
		vi.setSystemTime(new Date(start.getTime() + 60_001));
		expect(isLettaCircuitOpen()).toBe(false);
	});

	it("circuito não-reentra-aberto se uma nova falha vier antes da janela expirar", () => {
		// Comportamento atual: markLettaFailure só seta openUntil se circuito NÃO já aberto.
		vi.useFakeTimers();
		const start = new Date("2026-05-16T12:00:00.000Z");
		vi.setSystemTime(start);

		markLettaFailure("err1");
		markLettaFailure("err2");
		const firstOpenUntil = getLettaCircuitState().openUntilMs;

		// Outra falha durante a janela aberta — NÃO deve atualizar openUntil
		vi.setSystemTime(new Date(start.getTime() + 1000));
		markLettaFailure("err3");
		expect(getLettaCircuitState().openUntilMs).toBe(firstOpenUntil);
	});

	it("resetLettaCircuit zera estado", () => {
		markLettaFailure("err1");
		markLettaFailure("err2");
		expect(isLettaCircuitOpen()).toBe(true);
		resetLettaCircuit();
		expect(isLettaCircuitOpen()).toBe(false);
		expect(getLettaCircuitState().consecutiveFailures).toBe(0);
		expect(getLettaCircuitState().openUntilMs).toBe(0);
	});

	it("markLettaSuccess no estado inicial é no-op (não modifica nada)", () => {
		markLettaSuccess();
		expect(isLettaCircuitOpen()).toBe(false);
		expect(getLettaCircuitState().consecutiveFailures).toBe(0);
	});
});
