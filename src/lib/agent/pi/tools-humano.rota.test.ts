// ROTA DO `falar_com_humano`: sem proposta e sem pedido de fechar vai para a FILA de vendedores
// (P8); com proposta ou "bora fechar" vai para a MESA (P5). Fronteiras dubladas; o proxy real
// nunca é importado.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	abrirCasoNaMesa: vi.fn(),
	garantirLeadDoFecho: vi.fn(),
	getLatestBeviProposal: vi.fn(),
	loadConversationHistory: vi.fn(),
	loadIdentity: vi.fn(),
	saveContactName: vi.fn(),
	chamar: vi.fn(),
	estado: vi.fn(),
}));

vi.mock("@/lib/whatsapp/proxy", () => ({
	filaDeVendedoresReal: { chamar: vi.fn(), estado: vi.fn() },
}));
vi.mock("@/lib/agent/pi/tools-livres", () => ({ garantirLeadDoFecho: mocks.garantirLeadDoFecho }));
vi.mock("@/lib/agent/pi/handoff", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/agent/pi/handoff")>()),
	abrirCasoNaMesa: mocks.abrirCasoNaMesa,
}));
vi.mock("@/lib/bevi/proposal-repo", () => ({ getLatestBeviProposal: mocks.getLatestBeviProposal }));
vi.mock("@/lib/conversation/messages", () => ({
	loadConversationHistory: mocks.loadConversationHistory,
}));
vi.mock("@/lib/conversation/identity", () => ({ loadIdentity: mocks.loadIdentity }));
vi.mock("@/lib/leads/contact-capture", () => ({ saveContactName: mocks.saveContactName }));

import { criarToolsHumano, filaChamadaNoTurno } from "./tools-humano";
import type { ContextoDasTools } from "./tools-livres";

function ctxDoTurno(over: Partial<ContextoDasTools> = {}): ContextoDasTools {
	return {
		conversationId: "conv-rota",
		channel: "web",
		userText: "e se eu não for contemplado?",
		nomeDoCliente: "Mário",
		cards: [],
		falasDoFecho: [],
		cartasNaTela: [],
		gruposRevelados: new Map(),
		pediuHumano: false,
		estadoDepoisDaBusca: null,
		casoAbertoNesteTurno: vi.fn(),
		...over,
	} as ContextoDasTools;
}

async function chamarTool(ctx: ContextoDasTools): Promise<string> {
	const { falar_com_humano } = criarToolsHumano(ctx, {
		filaDeVendedores: { chamar: mocks.chamar, estado: mocks.estado },
	}) as unknown as {
		falar_com_humano: { execute: (i: unknown, o: unknown) => Promise<unknown> };
	};
	return String(
		await falar_com_humano.execute(
			{ motivo: "o cliente quer falar" },
			{ toolCallId: "c", messages: [] },
		),
	);
}

const SEM_PRAZO = /em instantes|em breve|minutos/i;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getLatestBeviProposal.mockResolvedValue(null);
	mocks.loadConversationHistory.mockResolvedValue([]);
	mocks.loadIdentity.mockResolvedValue(null);
	mocks.garantirLeadDoFecho.mockResolvedValue(undefined);
	mocks.saveContactName.mockResolvedValue({ ok: true, name: "Mário" });
	mocks.abrirCasoNaMesa.mockResolvedValue({ ok: true, motivo: "caso-aberto", handoffId: "h-1" });
	mocks.chamar.mockResolvedValue({ notificados: 2, semAtendentes: false });
});

describe("falar_com_humano: para onde cai", () => {
	it("1) objeção sem proposta vai para a fila, não para a mesa", async () => {
		const ctx = ctxDoTurno();
		const saida = await chamarTool(ctx);

		expect(mocks.chamar).toHaveBeenCalledTimes(1);
		expect(mocks.abrirCasoNaMesa).not.toHaveBeenCalled();
		expect(ctx.pediuHumano).toBe(false);
		expect(saida).not.toMatch(/pare de responder/i);
		expect(saida).not.toMatch(SEM_PRAZO);
		expect(saida).not.toContain("Caso NÃO aberto");
	});

	it("2) pedir uma pessoa sem proposta também é fila", async () => {
		await chamarTool(ctxDoTurno({ userText: "quero falar com uma pessoa" }));
		expect(mocks.chamar).toHaveBeenCalledTimes(1);
		expect(mocks.abrirCasoNaMesa).not.toHaveBeenCalled();
	});

	it("3) com proposta gerada vai para a mesa", async () => {
		mocks.getLatestBeviProposal.mockResolvedValue({ id: "prop-1" });
		const ctx = ctxDoTurno({ userText: "quero falar com uma pessoa" });
		const saida = await chamarTool(ctx);

		expect(mocks.abrirCasoNaMesa).toHaveBeenCalledTimes(1);
		expect(mocks.chamar).not.toHaveBeenCalled();
		expect(saida).toContain("Caso aberto na mesa");
		expect(ctx.pediuHumano).toBe(true);
	});

	it("4) 'bora fechar' sem proposta vai para a mesa", async () => {
		await chamarTool(ctxDoTurno({ userText: "bora fechar" }));
		expect(mocks.abrirCasoNaMesa).toHaveBeenCalledTimes(1);
		expect(mocks.chamar).not.toHaveBeenCalled();
	});

	it("5) sem atendentes a fila ainda manda continuar conduzindo", async () => {
		mocks.chamar.mockResolvedValue({ notificados: 0, semAtendentes: true });
		const saida = await chamarTool(ctxDoTurno());
		expect(saida).not.toContain("Caso NÃO aberto");
		expect(saida).toMatch(/continue conduzindo/i);
		expect(saida).not.toMatch(SEM_PRAZO);
	});

	it("6) casoAbertoNesteTurno só na mesa", async () => {
		const ctxFila = ctxDoTurno();
		await chamarTool(ctxFila);
		expect(ctxFila.casoAbertoNesteTurno).not.toHaveBeenCalled();

		const ctxMesa = ctxDoTurno({ userText: "bora fechar" });
		await chamarTool(ctxMesa);
		expect(ctxMesa.casoAbertoNesteTurno).toHaveBeenCalledTimes(1);
	});

	it("a fila chamada fica marcada no ctx; falha ao chamar não marca", async () => {
		const ctx = ctxDoTurno();
		expect(filaChamadaNoTurno(ctx)).toBeNull();
		await chamarTool(ctx);
		expect(filaChamadaNoTurno(ctx)).toBeInstanceOf(Date);

		mocks.chamar.mockRejectedValue(new Error("rede"));
		const ctx2 = ctxDoTurno();
		const saida = await chamarTool(ctx2);
		expect(filaChamadaNoTurno(ctx2)).toBeNull();
		expect(saida).toMatch(/continue conduzindo/i);
	});
});
