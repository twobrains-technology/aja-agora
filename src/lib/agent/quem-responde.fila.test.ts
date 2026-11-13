// A TRAVA É DA CONVERSA, NÃO DA PESSOA (decisão do dono, 12/11/2026).
//
// O que este arquivo prova, na ordem:
//
//   (a) conversa `active` e nada aberto → o agente fala;
//   (b) a MESMA pessoa numa OUTRA conversa `handed_off` com dono NÃO cala esta
//       conversa — é o teste da decisão do dono. Antes de 12/11 este caso devolvia
//       `humano`, e era assim que um `handed_off` velho matava a conversa nova do
//       cliente (web `62992496793`, 09/11 → três dias depois, sem resposta);
//   (c) a conversa de ENTRADA `handed_off` com dono → `humano`, com nome real;
//   (d) a conversa de entrada com caso em andamento e atendente → `humano`, mesa;
//   (e) a conversa de entrada com caso aberto sem atendente → `atendimento-sem-dono`;
//   (f) a conversa de entrada `handed_off` sem dono e sem caso → `agente` (resíduo).
//
// O dublê do banco responde como o banco responderia: `findFirst` devolve a linha
// que o `where` pediu (por id) e `findMany` devolve TUDO — inclusive as conversas
// `handed_off` de outros telefones/conversas. É de propósito: se a decisão voltar a
// varrer as conversas da pessoa, o caso (b) falha.

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
	conversas: [] as unknown[],
	casos: [] as unknown[],
	info: [] as string[],
}));

/**
 * Os valores que o `where` carrega. O dublê precisa deles para devolver a linha
 * certa; o drizzle guarda os parâmetros em `queryChunks`, e é só isso que se lê.
 */
function valoresDoWhere(no: unknown, achados: string[] = []): string[] {
	if (!no || typeof no !== "object") return achados;
	const { value, queryChunks } = no as { value?: unknown; queryChunks?: unknown[] };
	if (typeof value === "string") achados.push(value);
	else if (Array.isArray(value)) {
		for (const v of value) if (typeof v === "string") achados.push(v);
	}
	if (Array.isArray(queryChunks)) for (const c of queryChunks) valoresDoWhere(c, achados);
	return achados;
}

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				// A linha que o `eq(conversations.id, …)` pediu — como o banco faria.
				findFirst: vi.fn(async (args: { where?: unknown }) => {
					const ids = valoresDoWhere(args?.where);
					return (estado.conversas as Linha[]).find((c) => ids.includes(c.id)) ?? null;
				}),
				// TUDO o que está em atendimento, de qualquer conversa. Nenhuma
				// implementação correta chama isto: é o detector de regressão.
				findMany: vi.fn(async () =>
					(estado.conversas as Linha[]).filter((c) => c.status === "handed_off"),
				),
			},
			mesaHandoffs: {
				findMany: vi.fn(async (args: { where?: unknown }) => {
					const ids = valoresDoWhere(args?.where);
					return (estado.casos as Caso[]).filter(
						(c) =>
							(c.status === "aberto" || c.status === "em_andamento") &&
							c.conversationId !== null &&
							ids.includes(c.conversationId),
					);
				}),
			},
		},
	},
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { agenteCalaAposRelay, quemRespondePara } from "./quem-responde";

const WA_ID = "556292496793";

/** A conversa que recebeu a fala do cliente. */
const entrada = (over: Partial<Linha> = {}): Linha => ({
	id: "conv-nova",
	waId: WA_ID,
	status: "active",
	handedOffUserId: null,
	...over,
});

beforeEach(() => {
	estado.conversas = [];
	estado.casos = [];
	estado.info = [];
	vi.clearAllMocks();
	vi.spyOn(console, "info").mockImplementation((msg?: unknown) => {
		estado.info.push(String(msg));
	});
});

describe("quemRespondePara — a trava é da conversa, não da pessoa", () => {
	it("(a) conversa active, nada aberto: o agente fala", async () => {
		estado.conversas = [entrada()];

		expect(await quemRespondePara({ id: "conv-nova", waId: WA_ID })).toEqual({
			quem: "agente",
			motivo: "sem-atendimento-aberto",
		});
	});

	it("(b) outra conversa da MESMA pessoa, handed_off com dono, não cala esta conversa nova", async () => {
		estado.conversas = [
			// A conversa de ENTRADA — a nova, aberta hoje pelo cliente.
			entrada(),
			// A velha, do mesmo telefone, ainda marcada `handed_off` com dono. É o
			// `handed_off` de 09/11 que perseguia o cliente três dias depois.
			{
				id: "conv-velha",
				waId: WA_ID,
				status: "handed_off",
				handedOffUserId: "atendente-1",
				handedOffUser: { id: "atendente-1", name: "Marina" },
			},
		];

		expect(await quemRespondePara({ id: "conv-nova", waId: WA_ID })).toEqual({
			quem: "agente",
			motivo: "sem-atendimento-aberto",
		});
	});

	it("(c) a conversa de entrada handed_off com dono: fala o humano, com nome real", async () => {
		estado.conversas = [
			entrada({
				status: "handed_off",
				handedOffUserId: "atendente-1",
				handedOffUser: { id: "atendente-1", name: "Marina" },
			}),
		];

		expect(await quemRespondePara({ id: "conv-nova", waId: WA_ID })).toEqual({
			quem: "humano",
			conversationId: "conv-nova",
			dono: { tipo: "vendedor", userId: "atendente-1", nome: "Marina" },
			handedOffUserId: "atendente-1",
		});
	});

	it("(d) a conversa de entrada com caso em andamento e atendente: fala a mesa, com nome real", async () => {
		estado.conversas = [entrada({ status: "handed_off" })];
		estado.casos = [
			{
				id: "handoff-1",
				conversationId: "conv-nova",
				status: "em_andamento",
				mesaAttendantId: "att-9",
				mesaAttendant: { id: "att-9", nome: "Juna" },
			},
		];

		expect(await quemRespondePara({ id: "conv-nova", waId: WA_ID })).toEqual({
			quem: "humano",
			conversationId: "conv-nova",
			dono: { tipo: "mesa", attendantId: "att-9", handoffId: "handoff-1", nome: "Juna" },
			handedOffUserId: null,
		});
	});

	it("(e) a conversa de entrada com caso aberto sem atendente: atendimento sem dono", async () => {
		// O teste antigo esperava `humano` aqui. Era o beco congelado em teste: o
		// cliente escrevia, o agente calava, e a mensagem ia para ninguém.
		estado.conversas = [entrada({ status: "handed_off" })];
		estado.casos = [
			{
				id: "handoff-1",
				conversationId: "conv-nova",
				status: "aberto",
				mesaAttendantId: null,
				mesaAttendant: null,
			},
		];

		expect(await quemRespondePara({ id: "conv-nova", waId: WA_ID })).toEqual({
			quem: "atendimento-sem-dono",
			conversationId: "conv-nova",
			handoffId: "handoff-1",
		});
	});

	it("(e') caso aberto com atendente NOMEADO não é dono: o dono é de quem assumiu", async () => {
		estado.conversas = [entrada({ status: "handed_off" })];
		estado.casos = [
			{
				id: "handoff-1",
				conversationId: "conv-nova",
				status: "aberto",
				mesaAttendantId: "att-9",
				mesaAttendant: { id: "att-9", nome: "Juna" },
			},
		];

		expect(await quemRespondePara({ id: "conv-nova", waId: WA_ID })).toEqual({
			quem: "atendimento-sem-dono",
			conversationId: "conv-nova",
			handoffId: "handoff-1",
		});
	});

	it("(f) a conversa de entrada handed_off sem dono e sem caso: o agente segue", async () => {
		estado.conversas = [entrada({ status: "handed_off" })];

		expect(await quemRespondePara({ id: "conv-nova", waId: WA_ID })).toEqual({
			quem: "agente",
			motivo: "sem-atendimento-aberto",
		});
	});

	it("caso da mesa de OUTRA conversa não cala esta", async () => {
		estado.conversas = [entrada()];
		estado.casos = [
			{
				id: "handoff-velho",
				conversationId: "conv-velha",
				status: "em_andamento",
				mesaAttendantId: "att-9",
				mesaAttendant: { id: "att-9", nome: "Juna" },
			},
		];

		expect((await quemRespondePara({ id: "conv-nova", waId: WA_ID })).quem).toBe("agente");
	});

	it("sem conversa (nula ou sem id): não há atendimento aberto", async () => {
		estado.conversas = [entrada()];

		expect(await quemRespondePara(null)).toEqual({
			quem: "agente",
			motivo: "sem-atendimento-aberto",
		});
		expect(await quemRespondePara(undefined)).toEqual({
			quem: "agente",
			motivo: "sem-atendimento-aberto",
		});
	});

	it("conversa encerrada (status active) com dono residual: o agente volta a falar", async () => {
		// "Encerrar atendimento" devolve a conversa com `status = active` e NÃO limpa
		// `handed_off_user_id`. Se o resíduo da coluna calasse, a conversa nunca
		// voltaria para o agente.
		estado.conversas = [
			entrada({ status: "active", handedOffUserId: "atendente-1", handedOffUser: null }),
		];

		expect((await quemRespondePara({ id: "conv-nova", waId: WA_ID })).quem).toBe("agente");
	});

	it("dono apontado pela coluna mas sumido (FK quebrada): sem dono, e o motivo vai ao rastro", async () => {
		estado.conversas = [
			entrada({ status: "handed_off", handedOffUserId: "atendente-x", handedOffUser: null }),
		];

		expect((await quemRespondePara({ id: "conv-nova", waId: WA_ID })).quem).toBe("agente");
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
