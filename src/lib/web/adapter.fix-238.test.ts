// FIX-238 (Fable r1, D3.3, gap P1 #5) — o gate `desire` (não bloqueante,
// FIX-233) NUNCA emitia pergunta na web: `gatePartData("desire")` é null por
// design (sem card — as duas perguntas são conversa livre), mas o emissor
// (pipeGatePrompt / pipeOrchestratorToWriter) só escrevia a PERGUNTA quando
// `data` (o card) existia — `if (data) { ...write question...; write card }`.
// Resultado ao vivo: turno morto após o nome ("Prazer, Madalena!" e nada mais).
// Fix: a pergunta (`gateQuestion`) e o card (`gatePartData`) são independentes
// — escreve a pergunta sempre que ela existir, escreve o card só se existir.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	reloadMeta: vi.fn(),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue("msg-1"),
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/conversation/meta", () => ({
	persistMeta: mocks.persistMeta,
	reloadMeta: mocks.reloadMeta,
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({ recordStageReached: mocks.recordStageReached }));

import { pipeGatePrompt, pipeOrchestratorToWriter } from "./adapter";

type Part = { type: string; delta?: string; data?: unknown };
function fakeWriter() {
	const parts: Part[] = [];
	return {
		parts,
		write: (p: Part) => {
			parts.push(p);
		},
	};
}

const META_AUTO = { currentCategory: "auto" as const };

beforeEach(() => {
	vi.clearAllMocks();
	mocks.reloadMeta.mockResolvedValue(META_AUTO);
});
afterEach(() => vi.clearAllMocks());

describe("FIX-238 — pipeGatePrompt emite a pergunta do gate desire mesmo sem card", () => {
	it("gate desire sem card (gatePartData=null) ainda escreve a pergunta 'Qual carro...'", async () => {
		const writer = fakeWriter();
		await pipeGatePrompt({ conversationId: "c1", gate: "desire", writer: writer as never });

		const textDeltas = writer.parts.filter((p) => p.type === "text-delta").map((p) => p.delta);
		expect(textDeltas.join("")).toMatch(/qual carro/i);
		// sem card — nenhum data-gate deveria sair pro gate desire
		expect(writer.parts.some((p) => p.type === "data-gate")).toBe(false);
	});

	it("gate com card (ex: experience) continua escrevendo pergunta + card, sem regressão", async () => {
		const writer = fakeWriter();
		await pipeGatePrompt({ conversationId: "c1", gate: "experience", writer: writer as never });

		expect(writer.parts.some((p) => p.type === "text-delta")).toBe(true);
		expect(writer.parts.some((p) => p.type === "data-gate")).toBe(true);
	});
});

describe("FIX-238 — pipeOrchestratorToWriter (evento 'gate' do orquestrador) idem", () => {
	async function* gateEvent(gate: string) {
		yield { type: "gate", gate } as never;
		yield { type: "finish", reason: "ok" } as never;
	}

	it("evento gate=desire sem card ainda emite a pergunta (não é turno morto)", async () => {
		const writer = fakeWriter();
		const { emittedVisible } = await pipeOrchestratorToWriter(
			gateEvent("desire"),
			writer as never,
			"c1",
		);

		const textDeltas = writer.parts.filter((p) => p.type === "text-delta").map((p) => p.delta);
		expect(textDeltas.join("")).toMatch(/qual carro/i);
		expect(emittedVisible).toBe(true);
	});
});
