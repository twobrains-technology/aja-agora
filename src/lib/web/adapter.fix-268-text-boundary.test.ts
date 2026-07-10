// FIX-268 (rodada 7, veredito Fable r6, residual D4 — "texto picotado"): novo
// TurnEvent "text-boundary" força o fechamento do balão de texto aberto, sem
// precisar de um artifact/gate no meio. Espelha o padrão de
// adapter.fix-250-suppression-trace.test.ts (writer fake, sem DB).
import { describe, expect, it, vi } from "vitest";
import { pipeOrchestratorToWriter } from "./adapter";

vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

async function* events(evs: unknown[]) {
	for (const ev of evs) yield ev as never;
}

describe("FIX-268 — 'text-boundary' fecha o balão aberto (1 balão = 1 ideia)", () => {
	it("dois text-delta separados por text-boundary viram DOIS blocos text-start/text-end (balões distintos)", async () => {
		const writer = { write: vi.fn(), merge: vi.fn() };
		await pipeOrchestratorToWriter(
			events([
				{ type: "text-delta", text: "Ah, e um detalhe sobre esse grupo, só pra você saber:" },
				{ type: "text-boundary" },
				{ type: "text-delta", text: "Boa! Então deixa eu confirmar com você:" },
			]),
			writer as never,
			"c1",
		);

		const parts = writer.write.mock.calls.map((call) => call[0] as { type?: string; id?: string });
		const starts = parts.filter((part) => part.type === "text-start");
		const ends = parts.filter((part) => part.type === "text-end");

		expect(starts).toHaveLength(2);
		expect(ends).toHaveLength(2);
		expect(starts[0]?.id).not.toBe(starts[1]?.id);
	});

	it("sem 'text-boundary', dois text-delta seguidos caem no MESMO balão (prova do bug original)", async () => {
		const writer = { write: vi.fn(), merge: vi.fn() };
		await pipeOrchestratorToWriter(
			events([
				{ type: "text-delta", text: "primeira ideia:" },
				{ type: "text-delta", text: "segunda ideia" },
			]),
			writer as never,
			"c1",
		);

		const starts = writer.write.mock.calls
			.map((call) => call[0] as { type?: string })
			.filter((part) => part.type === "text-start");
		expect(starts).toHaveLength(1);
	});
});
