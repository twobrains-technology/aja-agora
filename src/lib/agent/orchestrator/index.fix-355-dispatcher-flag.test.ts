// FIX-355 — `runTurn()` (index.ts) vira um DISPATCHER fino por `AI_RUNTIME`:
// default/`vercel` chama o corpo original (agora `runTurnVercel`, rename
// mecânico); `langgraph` delega pro novo runtime (`runTurnLangGraph`,
// lib/agent/langgraph/run-turn.ts). Invariante de ROTEAMENTO, não de copy —
// por isso prova o CAMINHO tomado, não o conteúdo de nenhuma resposta.
//
// Estratégia sem DB/rede: `runTurnLangGraph` é mockado (prova que o dispatcher
// delega pra ele quando a flag pede langgraph, sem tocar runTurnVercel). Pro
// caminho `vercel` (default), aproveita que `runTurnVercel` lança
// SINCRONAMENTE (antes de qualquer I/O) quando `conversationId` está vazio —
// prova que a execução chegou no corpo Vercel sem precisar de banco real.
import { afterEach, describe, expect, it, vi } from "vitest";

const langGraphMock = vi.fn(async function* (_input: unknown) {
	yield { type: "finish", reason: "langgraph-stub-sentinel" } as const;
});

vi.mock("@/lib/agent/langgraph/run-turn", () => ({
	runTurnLangGraph: (input: unknown) => langGraphMock(input),
}));

const ORIGINAL_AI_RUNTIME = process.env.AI_RUNTIME;

afterEach(() => {
	if (ORIGINAL_AI_RUNTIME === undefined) delete process.env.AI_RUNTIME;
	else process.env.AI_RUNTIME = ORIGINAL_AI_RUNTIME;
	langGraphMock.mockClear();
});

async function drain(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
	const out: unknown[] = [];
	for await (const ev of gen) out.push(ev);
	return out;
}

describe("FIX-355 — dispatcher runTurn() por AI_RUNTIME", () => {
	it('AI_RUNTIME="langgraph" delega pra runTurnLangGraph (não toca runTurnVercel)', async () => {
		process.env.AI_RUNTIME = "langgraph";
		const { runTurn } = await import("./index");

		const events = await drain(
			runTurn({
				channel: "web",
				conversationId: "00000000-0000-4000-8000-000000000001",
				userText: "oi",
				isUserTurn: true,
			}),
		);

		expect(langGraphMock).toHaveBeenCalledTimes(1);
		expect(events).toEqual([{ type: "finish", reason: "langgraph-stub-sentinel" }]);
	});

	it("AI_RUNTIME unset (default) chama o corpo Vercel — nunca o langgraph", async () => {
		delete process.env.AI_RUNTIME;
		const { runTurn } = await import("./index");

		// conversationId vazio faz runTurnVercel lançar SINCRONAMENTE, antes de
		// qualquer I/O — prova que a execução chegou lá sem precisar de DB.
		await expect(
			drain(
				runTurn({
					channel: "web",
					conversationId: "",
					userText: "oi",
					isUserTurn: true,
				}),
			),
		).rejects.toThrow("[orchestrator] conversationId is required");
		expect(langGraphMock).not.toHaveBeenCalled();
	});

	it('AI_RUNTIME="vercel" explícito — mesmo caminho do default', async () => {
		process.env.AI_RUNTIME = "vercel";
		const { runTurn } = await import("./index");

		await expect(
			drain(
				runTurn({
					channel: "web",
					conversationId: "",
					userText: "oi",
					isUserTurn: true,
				}),
			),
		).rejects.toThrow("[orchestrator] conversationId is required");
		expect(langGraphMock).not.toHaveBeenCalled();
	});

	it('AI_RUNTIME com lixo/whitespace ("  LangGraph  ") ainda resolve pra langgraph — trim+lowercase', async () => {
		process.env.AI_RUNTIME = "  LangGraph  ";
		const { runTurn } = await import("./index");

		const events = await drain(
			runTurn({
				channel: "web",
				conversationId: "00000000-0000-4000-8000-000000000002",
				userText: "oi",
				isUserTurn: true,
			}),
		);

		expect(langGraphMock).toHaveBeenCalledTimes(1);
		expect(events).toEqual([{ type: "finish", reason: "langgraph-stub-sentinel" }]);
	});
});
