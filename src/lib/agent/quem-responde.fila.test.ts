// U5 da F2 — silêncio, agora com dono. A fila de vendedores (P8) NÃO cala o
// agente; o claim de um atendente e o caso da mesa calam — e o caso ABERTO
// sem dono não cala, ele nomeia o estado (`atendimento-sem-dono`): o cliente
// recebia "Mensagem enviada para Consultor" sem nenhum humano do outro lado.
//
// O dublê do banco devolve só as linhas `handed_off` quinhadas com o dono, que
// é a forma que `quemRespondePara` pede ao banco (`with: handedOffUser`).

type Linha = {
	id: string;
	waId: string;
	status: "active" | "handed_off";
	handedOffUserId: string | null;
	handedOffUser?: { id: string; name: string } | null;
	metadata?: Record<string, unknown>;
};

type Caso = {
	id: string;
	conversationId: string | null;
	status: "aberto" | "em_andamento" | "concluido" | "cancelado";
	mesaAttendantId: string | null;
	mesaAttendant?: { id: string; nome: string } | null;
};

const estado = vi.hoisted(() => ({
	linhas: [] as unknown[],
	casos: [] as unknown[],
	info: [] as string[],
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				findMany: vi.fn(async () =>
					(estado.linhas as { status: string }[]).filter((l) => l.status === "handed_off"),
				),
			},
			mesaHandoffs: {
				findMany: vi.fn(async () =>
					(estado.casos as Caso[]).filter((c) => c.status === "aberto" || c.status === "em_andamento"),
				),
			},
		},
	},
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { agenteCalaAposRelay, quemRespondePara } from "./quem-responde";

const WA_ID = "556292496793";

/** O `console.info` do rastro não polui a saída do gate. */
beforeEach(() => {
	estado.linhas = [];
	estado.casos = [];
	estado.info = [];
	vi.spyOn(console, "info").mockImplementation((msg?: unknown) => {
		estado.info.push(String(msg));
	});
});

describe("quemRespondePara — fila de vendedores e silêncio", () => {
	it("(a) conversa active com marcador da fila e sem dono: o agente segue falando", async () => {
		const conversa: Linha = {
			id: "conv-1",
			waId: WA_ID,
			status: "active",
			handedOffUserId: null,
			metadata: { filaDeVendedores: { chamadaEm: "2026-11-04T18:00:00.000Z" } },
		};
		estado.linhas = [conversa];

		expect(await quemRespondePara(WA_ID)).toEqual({
			quem: "agente",
			motivo: "sem-atendimento-aberto",
		});
	});

	it("(b) após o claim (handed_off + handedOffUserId): fala o humano, com nome real", async () => {
		const conversa: Linha = {
			id: "conv-1",
			waId: WA_ID,
			status: "handed_off",
			handedOffUserId: "atendente-1",
			handedOffUser: { id: "atendente-1", name: "Marina" },
			metadata: { filaDeVendedores: { chamadaEm: "2026-11-04T18:00:00.000Z" } },
		};
		estado.linhas = [conversa];

		expect(await quemRespondePara(WA_ID)).toEqual({
			quem: "humano",
			conversationId: "conv-1",
			dono: { tipo: "vendedor", userId: "atendente-1", nome: "Marina" },
			handedOffUserId: "atendente-1",
		});
	});

	it("(b') o claim vale em outro formato do mesmo telefone", async () => {
		estado.linhas = [
			{
				id: "conv-web",
				waId: "62992496793",
				status: "handed_off",
				handedOffUserId: "atendente-1",
				handedOffUser: { id: "atendente-1", name: "Marina" },
			},
		];

		const r = await quemRespondePara(WA_ID);
		expect(r).toMatchObject({ quem: "humano", conversationId: "conv-web" });
	});

	it("(c) handed_off sem dono e sem caso na mesa: o agente segue (linha velha não cala)", async () => {
		estado.linhas = [
			{ id: "conv-velha", waId: WA_ID, status: "handed_off", handedOffUserId: null },
		];

		expect(await quemRespondePara(WA_ID)).toEqual({
			quem: "agente",
			motivo: "sem-atendimento-aberto",
		});
	});

	it("(d) caso aberto sem atendente: atendimento sem dono (não é humano, não é agente)", async () => {
		// O teste antigo esperava `humano` aqui. Era o beco congelado em teste: o
		// cliente escrevia, o agente calava, e a mensagem ia para ninguém.
		estado.linhas = [{ id: "conv-mesa", waId: WA_ID, status: "handed_off", handedOffUserId: null }];
		estado.casos = [
			{
				id: "handoff-1",
				conversationId: "conv-mesa",
				status: "aberto",
				mesaAttendantId: null,
				mesaAttendant: null,
			},
		];

		expect(await quemRespondePara(WA_ID)).toEqual({
			quem: "atendimento-sem-dono",
			conversationId: "conv-mesa",
			handoffId: "handoff-1",
		});
	});

	it("(d'') caso aberto com atendente NOMEADO não é dono: o dono é de quem assumiu", async () => {
		estado.linhas = [{ id: "conv-mesa", waId: WA_ID, status: "handed_off", handedOffUserId: null }];
		estado.casos = [
			{
				id: "handoff-1",
				conversationId: "conv-mesa",
				status: "aberto",
				mesaAttendantId: "att-9",
				mesaAttendant: { id: "att-9", nome: "Juna" },
			},
		];

		expect(await quemRespondePara(WA_ID)).toEqual({
			quem: "atendimento-sem-dono",
			conversationId: "conv-mesa",
			handoffId: "handoff-1",
		});
	});

	it("(e) caso em andamento com atendente de mesa: fala o humano, com nome real", async () => {
		estado.linhas = [{ id: "conv-mesa", waId: WA_ID, status: "handed_off", handedOffUserId: null }];
		estado.casos = [
			{
				id: "handoff-1",
				conversationId: "conv-mesa",
				status: "em_andamento",
				mesaAttendantId: "att-9",
				mesaAttendant: { id: "att-9", nome: "Juna" },
			},
		];

		expect(await quemRespondePara(WA_ID)).toEqual({
			quem: "humano",
			conversationId: "conv-mesa",
			dono: { tipo: "mesa", attendantId: "att-9", handoffId: "handoff-1", nome: "Juna" },
			handedOffUserId: null,
		});
	});

	it("(f) duas conversas da mesma pessoa: a com dono vence a sem dono", async () => {
		estado.linhas = [
			// Veio primeiro na varredura — parar aqui devolveria o estado errado.
			{ id: "conv-zap", waId: "556292496793", status: "handed_off", handedOffUserId: null },
			{
				id: "conv-web",
				waId: "62992496793",
				status: "handed_off",
				handedOffUserId: "atendente-1",
				handedOffUser: { id: "atendente-1", name: "Marina" },
			},
		];
		estado.casos = [
			{
				id: "handoff-1",
				conversationId: "conv-zap",
				status: "aberto",
				mesaAttendantId: null,
				mesaAttendant: null,
			},
		];

		expect(await quemRespondePara(WA_ID)).toMatchObject({
			quem: "humano",
			conversationId: "conv-web",
			dono: { tipo: "vendedor", nome: "Marina" },
		});
	});

	it("dono apontado pela coluna mas sumido (FK quebrada): sem dono, e o motivo vai ao rastro", async () => {
		estado.linhas = [
			{ id: "conv-1", waId: WA_ID, status: "handed_off", handedOffUserId: "atendente-x" },
		];

		expect((await quemRespondePara(WA_ID)).quem).toBe("agente");
		expect(estado.info.join("\n")).toContain("dono-sumiu");
	});
});

describe("agenteCalaAposRelay", () => {
	it("(g) mesa cala mesmo sem entrega; vendedor só cala com entrega", () => {
		const mesa = {
			quem: "humano" as const,
			conversationId: "conv-mesa",
			dono: { tipo: "mesa" as const, attendantId: "att-9", handoffId: "handoff-1", nome: "Juna" },
			handedOffUserId: null,
		};
		const vendedor = {
			quem: "humano" as const,
			conversationId: "conv-1",
			dono: { tipo: "vendedor" as const, userId: "atendente-1", nome: "Marina" },
			handedOffUserId: "atendente-1",
		};

		expect(agenteCalaAposRelay(mesa, false)).toBe(true);
		expect(agenteCalaAposRelay(mesa, true)).toBe(true);
		expect(agenteCalaAposRelay(vendedor, false)).toBe(false);
		expect(agenteCalaAposRelay(vendedor, true)).toBe(true);
		// Ninguém assumiu: nada de silêncio, o turno é a acolhida.
		expect(
			agenteCalaAposRelay(
				{ quem: "atendimento-sem-dono", conversationId: "conv-mesa", handoffId: "handoff-1" },
				false,
			),
		).toBe(false);
	});
});
