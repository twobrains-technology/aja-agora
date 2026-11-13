// Bloco B — a RAMIFICAÇÃO da rota do chat web por quem responde.
//
// O defeito medido (print do operador): a rota colapsava a decisão de
// `quemRespondePara` num booleano, então o estado "atendimento aberto e
// ninguém assumiu" desabava no turno normal do agente — que calava — e a única
// coisa que o cliente lia era "Mensagem enviada para Consultor. Aguarde a
// resposta aqui.", com nome inventado e sem ninguém do outro lado.
//
// Aqui o POST roda de verdade (stream do AI SDK incluso) com banco, relay e
// turno mockados: o que se prova é o FIO — quem cala, quem acolhe e o que fica
// gravado.

import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
	quemRespondePara: vi.fn(),
	relayWebUserToAgent: vi.fn(),
	saveMessage: vi.fn(),
	publishMessage: vi.fn(),
	pipeDirectiveTurn: vi.fn(),
	pipeUserTurn: vi.fn(),
	persistMeta: vi.fn(),
	reloadMeta: vi.fn(),
	propostaDaConversa: vi.fn(),
	findFirstConvs: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: mock.findFirstConvs },
			leads: { findFirst: vi.fn() },
		},
		insert: () => ({ values: async () => undefined }),
		update: () => ({ set: () => ({ where: async () => undefined }) }),
	},
}));

vi.mock("@/lib/agent/quem-responde", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/agent/quem-responde")>();
	return { ...real, quemRespondePara: mock.quemRespondePara };
});

vi.mock("@/lib/whatsapp/proxy", () => ({
	relayWebUserToAgent: mock.relayWebUserToAgent,
}));

vi.mock("@/lib/web/adapter", () => ({
	pipeDirectiveTurn: mock.pipeDirectiveTurn,
	pipeUserTurn: mock.pipeUserTurn,
	pipeOrchestratorToWriter: vi.fn(),
}));

vi.mock("@/lib/conversation/messages", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/conversation/messages")>();
	return { ...real, saveMessage: mock.saveMessage };
});

vi.mock("@/lib/conversation/meta", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/conversation/meta")>();
	return { ...real, persistMeta: mock.persistMeta, reloadMeta: mock.reloadMeta };
});

vi.mock("@/lib/chat/message-bus", () => ({ publishMessage: mock.publishMessage }));

vi.mock("@/lib/workers/acolhida-n1-cycle", () => ({
	propostaDaConversa: mock.propostaDaConversa,
}));

const { POST } = await import("./route");

const CONVERSA = {
	id: "11111111-1111-4111-8111-111111111111",
	waId: "556292496793",
	contactName: "Rute",
	channel: "web" as const,
	isSimulated: false,
	status: "handed_off",
	// `webCookie` já gravado: sem ele a rota faria o backfill (update) no caminho.
	metadata: { webCookie: "uid-do-teste" },
};

function requisicao(conversationId: string, texto: string): NextRequest {
	return {
		headers: new Headers({ "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }),
		cookies: { get: () => undefined },
		json: async () => ({
			conversationId,
			messages: [{ id: "msg-1", role: "user", parts: [{ type: "text", text: texto }] }],
		}),
	} as unknown as NextRequest;
}

/** O SSE inteiro, como texto — é o que o `useChat` lê. */
async function corpoDaResposta(res: Response): Promise<string> {
	return await res.text();
}

const HUMANO_MESA = {
	quem: "humano" as const,
	conversationId: CONVERSA.id,
	dono: { tipo: "mesa" as const, attendantId: "att-1", handoffId: "hand-1", nome: "Juna" },
	handedOffUserId: null,
};

const HUMANO_VENDEDOR = {
	quem: "humano" as const,
	conversationId: CONVERSA.id,
	dono: { tipo: "vendedor" as const, userId: "user-1", nome: "Ana Paula" },
	handedOffUserId: "user-1",
};

const SEM_DONO = {
	quem: "atendimento-sem-dono" as const,
	conversationId: CONVERSA.id,
	handoffId: "hand-1",
};

beforeEach(() => {
	vi.clearAllMocks();
	mock.findFirstConvs.mockResolvedValue(CONVERSA);
	mock.relayWebUserToAgent.mockResolvedValue(true);
	mock.reloadMeta.mockResolvedValue({});
	mock.propostaDaConversa.mockResolvedValue(null);
	mock.pipeDirectiveTurn.mockResolvedValue({ emittedVisible: true });
	mock.pipeUserTurn.mockResolvedValue(undefined);
});

describe("assumido por um humano — o aviso sai com o NOME de quem assumiu", () => {
	it("mesa: cala o agente, grava o aviso no histórico e manda no stream", async () => {
		mock.quemRespondePara.mockResolvedValue(HUMANO_MESA);

		const res = await POST(requisicao(CONVERSA.id, "Acabei de fechar minha proposta"));
		const corpo = await corpoDaResposta(res);

		expect(res.headers.get("X-Handed-Off")).toBe("true");
		expect(corpo).toContain("Juna");
		expect(corpo).not.toMatch(/consultor/i);

		// O aviso é resposta de verdade: está no banco antes de sair no stream.
		const avisos = mock.saveMessage.mock.calls.filter(
			(c) => c[1] === "assistant" && String(c[2]).startsWith("Mensagem enviada para"),
		);
		expect(avisos).toHaveLength(1);
		expect(avisos[0]?.[2]).toContain("Juna");
		expect(avisos[0]?.[2]).not.toMatch(/consultor/i);

		// Nada de turno: quem responde é gente.
		expect(mock.pipeUserTurn).not.toHaveBeenCalled();
		expect(mock.pipeDirectiveTurn).not.toHaveBeenCalled();
	});

	it("vendedor com entrega: mesmo caminho, com o nome dele", async () => {
		mock.quemRespondePara.mockResolvedValue(HUMANO_VENDEDOR);
		mock.relayWebUserToAgent.mockResolvedValue(true);

		const res = await POST(requisicao(CONVERSA.id, "Uns R$ 250 mil"));
		const corpo = await corpoDaResposta(res);

		expect(corpo).toContain("Ana Paula");
		expect(mock.pipeUserTurn).not.toHaveBeenCalled();
	});

	it("vendedor SEM entrega (OC-31): o agente assume o turno", async () => {
		mock.quemRespondePara.mockResolvedValue(HUMANO_VENDEDOR);
		mock.relayWebUserToAgent.mockResolvedValue(false);

		const res = await POST(requisicao(CONVERSA.id, "Oi?"));

		expect(res.headers.get("X-Handed-Off")).toBeNull();
		expect(mock.pipeUserTurn).toHaveBeenCalledTimes(1);
	});
});

describe("atendimento sem dono — a conversa não morre (P0/P8)", () => {
	it("roda o turno com a diretiva da acolhida, não com o aviso", async () => {
		mock.quemRespondePara.mockResolvedValue(SEM_DONO);

		const res = await POST(requisicao(CONVERSA.id, "Uns R$ 250 mil"));
		const corpo = await corpoDaResposta(res);

		// Nada de "Mensagem enviada para" — não há ninguém para quem enviar.
		expect(corpo).not.toContain("Mensagem enviada para");
		expect(res.headers.get("X-Handed-Off")).toBeNull();

		expect(mock.pipeDirectiveTurn).toHaveBeenCalledTimes(1);
		const diretiva = String(mock.pipeDirectiveTurn.mock.calls[0]?.[0]?.directive ?? "");
		expect(diretiva).toMatch(/NINGUÉM assumiu/i);
		expect(diretiva).toMatch(/já está com a mesa/i);

		// A fala do cliente continua no histórico, e o turno não fica mudo.
		expect(
			mock.saveMessage.mock.calls.some((c) => c[1] === "user" && c[2] === "Uns R$ 250 mil"),
		).toBe(true);
		expect(
			mock.saveMessage.mock.calls.some(
				(c) => c[1] === "assistant" && String(c[2]).startsWith("Acho que me perdi"),
			),
		).toBe(true);
	});

	it("marca a acolhida no metadata para o worker N1 não repetir", async () => {
		mock.quemRespondePara.mockResolvedValue(SEM_DONO);

		await POST(requisicao(CONVERSA.id, "Oi, tudo bem?"));

		const marcacao = mock.persistMeta.mock.calls.find(
			(c) => (c[1] as { acolhidaN1?: { lastAt: number } })?.acolhidaN1?.lastAt !== undefined,
		);
		expect(marcacao, "a acolhida inline não foi marcada no metadata").toBeTruthy();
	});

	it("conversa sem `waId` (web anônima): a decisão é da CONVERSA, e o turno normal segue", async () => {
		// A pergunta não é mais "este telefone está em atendimento?": a conversa de
		// entrada decide, com ou sem telefone (12/11/2026).
		mock.findFirstConvs.mockResolvedValue({ ...CONVERSA, waId: null });
		mock.quemRespondePara.mockResolvedValue({
			quem: "agente",
			motivo: "sem-atendimento-aberto",
		});

		const res = await POST(requisicao(CONVERSA.id, "quero um carro de 80 mil"));

		expect(mock.quemRespondePara).toHaveBeenCalledWith(
			expect.objectContaining({ id: CONVERSA.id, waId: null }),
		);
		expect(mock.pipeUserTurn).toHaveBeenCalledTimes(1);
		expect(res.status).toBe(200);
	});
});
