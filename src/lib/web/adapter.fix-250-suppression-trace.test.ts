// FIX-250 (rodada 3, Fable r2, N7 — observabilidade, Lei 5): `turn-trace.
// suppressed` ficava SEMPRE `[]` no canal web — "suppression" é um TurnEvent
// que nunca vira UI part (de propósito: não é pro usuário ver), então o
// mecanismo de tap por proxy do writer (instrumentWriter/recordUIPart) nunca
// o enxergava. `pipeOrchestratorToWriter` agora recupera o trace pelo writer
// já instrumentado (getTraceForWriter) e alimenta suppression/usage direto.
import { describe, expect, it, vi } from "vitest";
import { instrumentWriter, TurnTrace } from "@/lib/telemetry/turn-trace";
import { pipeOrchestratorToWriter } from "./adapter";

vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

async function* events(evs: unknown[]) {
	for (const ev of evs) yield ev as never;
}

describe("FIX-250 — pipeOrchestratorToWriter alimenta suppression/usage no trace (canal web)", () => {
	it("evento 'suppression' NÃO vira UI part, mas fica registrado no trace.suppressed", async () => {
		const trace = new TurnTrace({ conversationId: "c1", channel: "web" });
		const rawWriter = { write: vi.fn(), merge: vi.fn() };
		const writer = instrumentWriter(rawWriter as never, trace);

		await pipeOrchestratorToWriter(
			events([
				{ type: "suppression", artifactType: "decision_prompt", reason: "premature-decision" },
				{ type: "finish", reason: "ok" },
			]),
			writer,
			"c1",
		);

		// nada foi escrito no writer real (suppression não é UI part).
		expect(rawWriter.write).not.toHaveBeenCalled();

		const record = trace.finalize();
		expect(record.suppressed).toContain("decision_prompt");
	});

	it("evento 'usage' fica registrado em cacheRead/cacheWrite do trace", async () => {
		const trace = new TurnTrace({ conversationId: "c1", channel: "web" });
		const rawWriter = { write: vi.fn(), merge: vi.fn() };
		const writer = instrumentWriter(rawWriter as never, trace);

		await pipeOrchestratorToWriter(
			events([{ type: "usage", cacheRead: 120, cacheWrite: 45 }]),
			writer,
			"c1",
		);

		const record = trace.finalize();
		expect(record.cacheRead).toBe(120);
		expect(record.cacheWrite).toBe(45);
	});

	it("sem writer instrumentado (trace ausente), NÃO lança — só não registra nada", async () => {
		const rawWriter = { write: vi.fn(), merge: vi.fn() };
		await expect(
			pipeOrchestratorToWriter(
				events([{ type: "suppression", artifactType: "decision_prompt", reason: "x" }]),
				rawWriter as never,
				"c1",
			),
		).resolves.not.toThrow();
	});
});
