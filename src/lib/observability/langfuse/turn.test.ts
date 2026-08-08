// withLangfuseTurn — contrato: (1) desligado ⇒ roda o turno sem trace;
// (2) ligado ⇒ trace com sessionId/userId/tags; (3) erro do SDK ⇒ turno roda
// UMA vez, sem trace, sem propagar; (4) erro do TURNO propaga (não é engolido
// nem re-executado — engolir mascararia bug real do agente).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startActiveObservation = vi.fn();
const updateActiveTrace = vi.fn();
vi.mock("@langfuse/tracing", () => ({
	startActiveObservation: (...args: unknown[]) => startActiveObservation(...args),
	updateActiveTrace: (...args: unknown[]) => updateActiveTrace(...args),
}));

import { withLangfuseTurn } from "./turn";

const KEYS = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"] as const;
let saved: Record<string, string | undefined>;

const CTX = {
	conversationId: "conv-1",
	channel: "web" as const,
	isSimulated: true,
	persona: "imovel",
	userId: "uid-9",
	userText: "oi",
};

function configure() {
	process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-x";
	process.env.LANGFUSE_SECRET_KEY = "sk-lf-x";
	process.env.LANGFUSE_BASE_URL = "https://langfuse.example.com";
}

beforeEach(() => {
	saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
	for (const k of KEYS) delete process.env[k];
	startActiveObservation.mockReset();
	updateActiveTrace.mockReset();
});

afterEach(() => {
	for (const k of KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe("withLangfuseTurn", () => {
	it("desligado: executa o turno com traceId null e não toca o SDK", async () => {
		const result = await withLangfuseTurn(CTX, async (turn) => {
			expect(turn.traceId).toBeNull();
			return "ok";
		});
		expect(result).toBe("ok");
		expect(startActiveObservation).not.toHaveBeenCalled();
	});

	it("ligado: abre observation 'turn', seta sessionId/userId/tags e entrega o traceId", async () => {
		configure();
		startActiveObservation.mockImplementation(async (_name, fn) => fn({ traceId: "t-123" }));

		const result = await withLangfuseTurn(CTX, async (turn) => {
			expect(turn.traceId).toBe("t-123");
			return 42;
		});

		expect(result).toBe(42);
		expect(startActiveObservation).toHaveBeenCalledWith("turn", expect.any(Function));
		expect(updateActiveTrace).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "conv-1",
				userId: "uid-9",
				tags: expect.arrayContaining(["channel:web", "simulated:true", "persona:imovel"]),
				input: "oi",
			}),
		);
	});

	it("SDK lançando ANTES do turno: turno roda uma única vez, sem trace, erro não propaga", async () => {
		configure();
		startActiveObservation.mockImplementation(() => {
			throw new Error("sdk quebrou");
		});
		const fn = vi.fn(async (turn: { traceId: string | null }) => turn.traceId ?? "sem-trace");

		const result = await withLangfuseTurn(CTX, fn);

		expect(result).toBe("sem-trace");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("erro do TURNO propaga (não é engolido nem re-executado)", async () => {
		configure();
		startActiveObservation.mockImplementation(async (_name, fn) => fn({ traceId: "t-123" }));
		const fn = vi.fn(async () => {
			throw new Error("bug real do agente");
		});

		await expect(withLangfuseTurn(CTX, fn)).rejects.toThrow("bug real do agente");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("setOutput registra o output do trace sem quebrar quando desligado", async () => {
		await withLangfuseTurn(CTX, async (turn) => {
			turn.setOutput("resposta final");
		});
		configure();
		startActiveObservation.mockImplementation(async (_name, fn) => fn({ traceId: "t-1" }));
		await withLangfuseTurn(CTX, async (turn) => {
			turn.setOutput("resposta final");
		});
		expect(updateActiveTrace).toHaveBeenCalledWith(
			expect.objectContaining({ output: "resposta final" }),
		);
	});
});
