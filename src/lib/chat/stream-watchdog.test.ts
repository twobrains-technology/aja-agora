// FIX-110 — watchdog de stream preso (client).
// Defesa contra um stream que MORRE sem emitir fim nem erro (conexão/proxy caiu):
// sem isto o useChat fica preso em "streaming"/"submitted" pra sempre e o input
// nunca libera. A função é pura (decide a partir de status + inatividade) pra ser
// testável sem React.
import { describe, expect, it } from "vitest";
import { isStreamStuck, STREAM_STALL_TIMEOUT_MS } from "./stream-watchdog";

describe("FIX-110 — isStreamStuck (watchdog de stream preso)", () => {
	it("timeout padrão é generoso (> 30s) pra não matar turno legítimo lento", () => {
		expect(STREAM_STALL_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
	});

	it("NÃO está preso enquanto há atividade recente", () => {
		expect(isStreamStuck({ status: "streaming", msSinceLastActivity: 2_000 })).toBe(false);
		expect(isStreamStuck({ status: "submitted", msSinceLastActivity: 2_000 })).toBe(false);
	});

	it("está preso quando passou do timeout sem nenhuma atividade", () => {
		expect(
			isStreamStuck({ status: "streaming", msSinceLastActivity: STREAM_STALL_TIMEOUT_MS + 1 }),
		).toBe(true);
		expect(
			isStreamStuck({ status: "submitted", msSinceLastActivity: STREAM_STALL_TIMEOUT_MS + 1 }),
		).toBe(true);
	});

	it("status ready/error NUNCA conta como preso (turno já terminou)", () => {
		expect(isStreamStuck({ status: "ready", msSinceLastActivity: 999_999 })).toBe(false);
		expect(isStreamStuck({ status: "error", msSinceLastActivity: 999_999 })).toBe(false);
	});

	it("aceita timeout custom", () => {
		expect(
			isStreamStuck({ status: "streaming", msSinceLastActivity: 1_500, timeoutMs: 1_000 }),
		).toBe(true);
	});
});
