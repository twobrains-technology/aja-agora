import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({ requireRole: async () => ({ error: null }) }));
vi.mock("@/lib/utils/env", () => ({ isSimulatorEnabled: () => true }));
vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				findFirst: async () => ({
					id: "11111111-1111-4111-8111-111111111111",
					isSimulated: true,
				}),
			},
		},
	},
}));

import { POST } from "./route";

const pedido = (body: unknown) =>
	POST(
		new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}) as unknown as Parameters<typeof POST>[0],
		{ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
	);

describe("L42/P313 — o feedback do simulador não perde o turno avaliado", () => {
	let linhas: string[] = [];
	let log: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		linhas = [];
		log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			linhas.push(args.map(String).join(" "));
		});
	});

	it("grava o score com a sessão (conversa) E o turno (`traceId`) na linha local", async () => {
		const res = await pedido({ value: "down", traceId: "trace-do-turno-7", comment: "repetiu" });

		expect(res.status).toBe(200);
		const linha = linhas.find((l) => l.includes("[sinal]"));
		expect(linha).toBeDefined();
		expect(linha).toContain("user_feedback");
		expect(linha).toContain("11111111-1111-4111-8111-111111111111");
		// O `traceId` era mandado pela UI e DESCARTADO — sem ele o score não se
		// associa ao turno que o operador estava julgando.
		expect(linha).toContain("trace-do-turno-7");
		expect(linha).toContain("repetiu");
		log.mockRestore();
	});

	it("sem `traceId`, o score continua associado à conversa", async () => {
		const res = await pedido({ value: "up" });

		expect(res.status).toBe(200);
		const linha = linhas.find((l) => l.includes("[sinal]"));
		expect(linha).toContain('"value":1');
		expect(linha).not.toContain("traceId");
		log.mockRestore();
	});
});
