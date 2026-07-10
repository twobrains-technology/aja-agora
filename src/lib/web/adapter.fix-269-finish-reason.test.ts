// FIX-269 (rodada 7, veredito Fable r6, nit de observabilidade — Lei 5): o
// TurnEvent "finish" com o reason REAL do orquestrador (ex.:
// "tool-error-recovered") nunca chegava ao turn-trace no canal web — o case
// era agrupado como no-op puro. Espelha o padrão de
// adapter.fix-250-suppression-trace.test.ts (writer fake, sem DB).
import { describe, expect, it, vi } from "vitest";
import { instrumentWriter, TurnTrace } from "@/lib/telemetry/turn-trace";
import { pipeOrchestratorToWriter } from "./adapter";

vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

async function* events(evs: unknown[]) {
	for (const ev of evs) yield ev as never;
}

describe("FIX-269 — TurnEvent 'finish' chega no turn-trace (canal web)", () => {
	it("finishReason 'tool-error-recovered' fica registrado no trace (turno CONTIDO)", async () => {
		const trace = new TurnTrace({ conversationId: "c1", channel: "web" });
		const rawWriter = { write: vi.fn(), merge: vi.fn() };
		const writer = instrumentWriter(rawWriter as never, trace);

		await pipeOrchestratorToWriter(
			events([
				{ type: "text-delta", text: "as opções que já apareceram continuam valendo." },
				{ type: "finish", reason: "tool-error-recovered" },
			]),
			writer,
			"c1",
		);

		const record = trace.finalize();
		expect(record.finishReason).toBe("tool-error-recovered");
		expect(record.finishReason).not.toBe("ok");
	});

	it("trace.hasFinish() reflete se um finishReason real já chegou", async () => {
		const trace = new TurnTrace({ conversationId: "c1", channel: "web" });
		const rawWriter = { write: vi.fn(), merge: vi.fn() };
		const writer = instrumentWriter(rawWriter as never, trace);

		expect(trace.hasFinish()).toBe(false);
		await pipeOrchestratorToWriter(
			events([{ type: "finish", reason: "tool-call-cap-exceeded" }]),
			writer,
			"c1",
		);
		expect(trace.hasFinish()).toBe(true);
	});
});
