import { beforeEach, describe, expect, it, vi } from "vitest";

// U5 da F2 — silêncio. A fila de vendedores (P8) NÃO cala o agente; o claim de
// um atendente e o caso aberto na mesa calam. O dublê do banco devolve só as
// linhas `handed_off`, que é o filtro que `quemRespondePara` pede ao banco.

type Linha = {
	id: string;
	waId: string;
	status: "active" | "handed_off";
	handedOffUserId: string | null;
	metadata?: Record<string, unknown>;
};

const estado = vi.hoisted(() => ({ linhas: [] as unknown[] }));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: {
				findMany: vi.fn(async () =>
					(estado.linhas as { status: string }[]).filter((l) => l.status === "handed_off"),
				),
			},
		},
	},
}));

import { quemRespondePara } from "./quem-responde";

const WA_ID = "556292496793";

describe("quemRespondePara — fila de vendedores e silêncio", () => {
	beforeEach(() => {
		estado.linhas = [];
	});

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

	it("(b) após o claim (handed_off + handedOffUserId): fala o humano", async () => {
		const conversa: Linha = {
			id: "conv-1",
			waId: WA_ID,
			status: "handed_off",
			handedOffUserId: "atendente-1",
			metadata: { filaDeVendedores: { chamadaEm: "2026-11-04T18:00:00.000Z" } },
		};
		estado.linhas = [conversa];

		expect(await quemRespondePara(WA_ID)).toEqual({
			quem: "humano",
			conversationId: "conv-1",
			handedOffUserId: "atendente-1",
			semDestinatario: false,
		});
	});

	it("(b') o claim vale em outro formato do mesmo telefone", async () => {
		estado.linhas = [
			{ id: "conv-web", waId: "62992496793", status: "handed_off", handedOffUserId: "atendente-1" },
		];

		const r = await quemRespondePara(WA_ID);
		expect(r).toMatchObject({ quem: "humano", conversationId: "conv-web" });
	});

	it("(c) caso na mesa (handed_off, sem dono): fala o humano, marcado sem destinatário", async () => {
		estado.linhas = [{ id: "conv-mesa", waId: WA_ID, status: "handed_off", handedOffUserId: null }];

		expect(await quemRespondePara(WA_ID)).toEqual({
			quem: "humano",
			conversationId: "conv-mesa",
			handedOffUserId: null,
			semDestinatario: true,
		});
	});
});
