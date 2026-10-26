import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: async () => ({
		error: null,
		role: "admin",
		session: { user: { id: "user-op-1", email: "operador@aja.test" } },
	}),
}));
vi.mock("@/lib/utils/env", () => ({ isSimulatorEnabled: () => true }));

const gravadas: Record<string, unknown>[] = [];
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
		insert: () => ({
			values: async (linha: Record<string, unknown>) => {
				gravadas.push(linha);
			},
		}),
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
		gravadas.length = 0;
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

	it("a avaliação vira LINHA persistida — o stdout é só o espelho", async () => {
		await pedido({ value: "down", traceId: "trace-9", comment: "enrolou" });

		expect(gravadas).toHaveLength(1);
		expect(gravadas[0]).toMatchObject({
			conversationId: "11111111-1111-4111-8111-111111111111",
			traceId: "trace-9",
			origem: "simulador",
			nome: "user_feedback",
			valor: 0,
			comentario: "enrolou",
			criadoPor: "operador@aja.test",
		});
		log.mockRestore();
	});

	it("sem comentário/turno, a linha grava `null` em vez de sumir com o campo", async () => {
		await pedido({ value: "up" });

		expect(gravadas[0]).toMatchObject({ valor: 1, traceId: null, comentario: null });
		log.mockRestore();
	});
});
