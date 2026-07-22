// FIX-189 (pendura) — a resposta da descoberta chega SEM depender de novo input.
//
// Root cause (print agente-nao-responde-ate-novo-input): um turno de DESCOBERTA
// disparado por um gate (pipeSearchSummaryTurn) podia fechar SEM emitir nada
// visível (só o chip transitório "Buscando grupos") — e o caminho de ação do web
// NÃO roda o guard de turno-mudo. O reveal nunca chegava; o usuário tinha de
// cutucar ("travou?"). Fix: pipeSearchSummaryTurn detecta a descoberta muda e
// emite o fallback determinístico (nunca "atualiza a página" — respeita FIX-190).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_TURN_FALLBACK } from "@/lib/chat/empty-turn-guard";

const mocks = vi.hoisted(() => ({
	runTurn: vi.fn(),
	reloadMeta: vi.fn(),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue("msg-1"),
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agent/orchestrator", async (orig) => ({
	...(await (orig() as Promise<Record<string, unknown>>)),
	runTurn: mocks.runTurn,
}));
vi.mock("@/lib/conversation/meta", () => ({
	persistMeta: mocks.persistMeta,
	reloadMeta: mocks.reloadMeta,
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({ recordStageReached: mocks.recordStageReached }));

import { pipeSearchSummaryTurn } from "./adapter";

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

// Turno de descoberta MUDO: só o tool-call de busca (chip) + finish. Zero texto,
// zero artifact — exatamente o que pendurava.
async function* muteDiscovery() {
	yield { type: "tool-call", toolName: "search_groups", toolCallId: "tc1", input: {} } as never;
	yield { type: "finish", reason: "ok" } as never;
}
// Turno de descoberta FALANTE: reveal com texto + artifact (caso saudável).
async function* speakingDiscovery() {
	yield { type: "text-delta", text: "Olha só o que encontrei na sua faixa:" } as never;
	yield {
		type: "artifact",
		artifactType: "comparison_table",
		payload: { groups: [] },
		toolCallId: "tc2",
	} as never;
	yield { type: "finish", reason: "ok" } as never;
}

const READY_META = {
	searchDispatched: false,
	identityCollected: true,
	currentCategory: "auto",
	qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.reloadMeta.mockResolvedValue(READY_META);
});
afterEach(() => vi.clearAllMocks());

describe("FIX-189 — pipeSearchSummaryTurn recupera a descoberta muda (não pendura)", () => {
	it("descoberta MUDA (só chip) => emite o fallback determinístico, não silêncio", async () => {
		mocks.runTurn.mockReturnValue(muteDiscovery());
		const writer = fakeWriter();
		await pipeSearchSummaryTurn({
			conversationId: "c1",
			contactName: "Kairo",
			writer: writer as never,
		});

		const textDeltas = writer.parts.filter((p) => p.type === "text-delta").map((p) => p.delta);
		expect(textDeltas.join("")).toContain(EMPTY_TURN_FALLBACK);
	});

	it("descoberta FALANTE (texto+artifact) => NÃO emite fallback (sem resposta duplicada)", async () => {
		mocks.runTurn.mockReturnValue(speakingDiscovery());
		const writer = fakeWriter();
		await pipeSearchSummaryTurn({
			conversationId: "c1",
			contactName: "Kairo",
			writer: writer as never,
		});

		const textDeltas = writer.parts.filter((p) => p.type === "text-delta").map((p) => p.delta);
		expect(textDeltas.join("")).not.toContain(EMPTY_TURN_FALLBACK);
		// o reveal real saiu
		expect(writer.parts.some((p) => p.type === "data-artifact")).toBe(true);
	});

	it("o fallback NÃO é frase de refresh técnico (respeita FIX-190)", async () => {
		mocks.runTurn.mockReturnValue(muteDiscovery());
		const writer = fakeWriter();
		await pipeSearchSummaryTurn({
			conversationId: "c1",
			contactName: "Kairo",
			writer: writer as never,
		});
		const allText = writer.parts
			.filter((p) => p.type === "text-delta")
			.map((p) => p.delta)
			.join(" ");
		expect(allText).not.toMatch(/atualiz|recarregu?e|refresh/i);
	});
});
