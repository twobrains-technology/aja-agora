import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";

vi.mock("@/db", () => ({
	db: { query: { conversations: { findFirst: async () => null } } },
}));

/** O que de fato saiu pro cliente, na ordem em que saiu. */
const enviados: Array<{ kind: "text" | "interactive"; body: string }> = [];

vi.mock("./api", () => ({
	sendTextMessage: vi.fn(async (_to: string, text: string) => {
		enviados.push({ kind: "text", body: text });
		return { ok: true };
	}),
	sendInteractiveMessage: vi.fn(async (_to: string, interactive: Record<string, unknown>) => {
		enviados.push({ kind: "interactive", body: JSON.stringify(interactive) });
		return { ok: true };
	}),
}));

vi.mock("./session", () => ({ getOrCreateConversation: async () => ({ id: "conv-zapad" }) }));
vi.mock("@/lib/conversation/meta", () => ({
	reloadMeta: async () => ({}),
	persistMeta: async () => {},
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({ recordStageReached: async () => {} }));
vi.mock("@/lib/observability/trace-local", () => ({
	comTraceDoTurno: async (
		_ctx: unknown,
		fn: (turn: { traceId: string; setOutput: (t: string) => void }) => Promise<void>,
	) => fn({ traceId: "trace-zapad", setOutput: () => {} }),
}));
vi.mock("@/lib/telemetry/turn-trace", () => ({
	traceTurnEvents: (events: AsyncIterable<TurnEvent>) => events,
}));

/** Stream do turno, na ordem crua que o motor Pi emite. */
let stream: TurnEvent[] = [];
vi.mock("@/lib/agent/orchestrator", () => ({
	runTurn: () =>
		(async function* () {
			for (const ev of stream) yield ev;
		})(),
}));

const cardDoGrupo: TurnEvent = {
	type: "artifact",
	artifactType: "group_card",
	payload: {
		id: "grp-1",
		administradora: "Itaú",
		category: "imovel",
		creditValue: 300000,
		monthlyPayment: 1200,
		termMonths: 200,
	},
	toolCallId: "call-1",
};

describe("o aviso 'consultando as administradoras' reconhece a busca do vendedor livre", () => {
	it("buscar_cartas conta como busca", async () => {
		const { ehBuscaDeCartas } = await import("./adapter");
		expect(ehBuscaDeCartas("buscar_cartas")).toBe(true);
	});

	it("os nomes antigos da busca continuam contando", async () => {
		const { ehBuscaDeCartas } = await import("./adapter");
		expect(ehBuscaDeCartas("search_groups")).toBe(true);
		expect(ehBuscaDeCartas("recommend_groups")).toBe(true);
	});

	it("as outras tools não viram aviso de busca", async () => {
		const { ehBuscaDeCartas } = await import("./adapter");
		expect(ehBuscaDeCartas("fazer_proposta")).toBe(false);
		expect(ehBuscaDeCartas("mostrar_card")).toBe(false);
	});
});

describe("o card do WhatsApp sai na ordem do stream, não no fim do turno (P157)", () => {
	beforeEach(() => {
		enviados.length = 0;
	});

	it("texto, boundary, card, texto, finish: a conversa recebe texto → card → texto", async () => {
		stream = [
			{ type: "text-delta", text: "Achei duas cartas que caem no seu bolso." },
			{ type: "text-boundary" },
			cardDoGrupo,
			{ type: "text-delta", text: "Qual delas você quer simular primeiro?" },
			{ type: "finish", reason: "stop" },
		];
		const { processWithOrchestrator } = await import("./adapter");
		await processWithOrchestrator("5511999999999", "quero uma carta");

		expect(enviados.map((e) => e.kind)).toEqual(["text", "interactive", "text"]);
		expect(enviados[0]?.body).toContain("Achei duas cartas");
		expect(enviados[1]?.body).toContain("Itaú");
		expect(enviados[2]?.body).toContain("Qual delas");
	});

	it("o card sai UMA vez: o `finish` não reenvia o que já foi entregue", async () => {
		stream = [
			cardDoGrupo,
			{ type: "text-delta", text: "Essa é a carta de entrada." },
			{ type: "finish", reason: "stop" },
		];
		const { processWithOrchestrator } = await import("./adapter");
		await processWithOrchestrator("5511999999999", "manda a carta");

		expect(enviados.map((e) => e.kind)).toEqual(["interactive", "text"]);
		expect(enviados.filter((e) => e.body.includes("Itaú"))).toHaveLength(1);
	});

	it("sem card no turno, nada muda: só a fala sai, uma vez", async () => {
		stream = [
			{ type: "text-delta", text: "Tudo bem, me conta do seu objetivo." },
			{ type: "finish", reason: "stop" },
		];
		const { processWithOrchestrator } = await import("./adapter");
		await processWithOrchestrator("5511999999999", "oi");

		expect(enviados.map((e) => e.kind)).toEqual(["text"]);
		expect(enviados[0]?.body).toContain("me conta do seu objetivo");
	});
});
