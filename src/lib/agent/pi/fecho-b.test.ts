// O QUE O VENDEDOR LIVRE DEVOLVE AO CLIENTE quando o assunto é fato já existente:
//
//  · L15/P133 — a simulação de uma carta RESTAURADA (turno anterior, deploy no
//    meio) usava um adapter vazio e o card respondia "a simulação não voltou"
//    sobre uma carta que estava na tela.
//  · L19/P274 — "e a minha proposta?" não tinha tool: o status real morava em
//    funções que o vendedor livre não alcançava.
//  · R5.4 — o modelo pedia `value_picker` no WhatsApp, onde o card não existe:
//    chamada perdida em quase toda conversa do zap.
//  · CHIPS 1 — o atalho do card tem de sair com o `groupId` CONFERIDO.
//  · CHIPS 2 — o `contract_form` na tela prova `contractFormDispatched`.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GroupNotInDiscoveryError } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import type { GroupSummary, QuotaSimulation, SearchGroupsParams } from "@/lib/adapters/types";

const mocks = vi.hoisted(() => ({
	pessoaDaConversa: vi.fn(),
	ultimaPropostaDaPessoa: vi.fn(),
	checkProposalStatus: vi.fn(),
}));

vi.mock("@/lib/bevi/pessoa", () => ({
	pessoaDaConversa: mocks.pessoaDaConversa,
	ultimaPropostaDaPessoa: mocks.ultimaPropostaDaPessoa,
}));

vi.mock("@/lib/bevi/proposal-status", () => ({
	checkProposalStatus: mocks.checkProposalStatus,
}));

import { DESTINO_DOS_CARDS } from "./cards-livres";
import {
	buildToolsLivres,
	type ContextoDasTools,
	simularCotaDaCarta,
	tiposDeCardDoCanal,
} from "./tools-livres";

/** A carta que o cliente JÁ VIU — vem de `restaurarCartasDaConversa`, com os
 * números reais do payload persistido. É o que o turno entrega em
 * `gruposRevelados` e o que repõe o índice do adapter. */
const CARTA_RESTAURADA: GroupSummary = {
	id: "cota-restaurada",
	administradora: "ITAÚ",
	category: "auto",
	creditValue: 92_902,
	monthlyPayment: 1_450,
	adminFeePercent: 18,
	termMonths: 100,
	totalParticipants: 1_200,
	availableSlots: 9,
};

const SIMULACAO: QuotaSimulation = {
	groupId: CARTA_RESTAURADA.id,
	category: "auto",
	creditValue: 92_902,
	monthlyPayment: 1_450,
	adminFee: 16_722,
	reserveFund: 900,
	insurance: 740,
	totalCost: 145_000,
	termMonths: 100,
	effectiveRate: 0.56,
	lanceScenario: { lancePercent: 30, expectedTermMonths: 45 },
	embeddedBid: {
		percent: 30,
		embeddedBidValue: 27_870,
		receivedCredit: 65_032,
		necessaryBidToContemplate: 24_000,
	},
	expectedAdjustment: { index: "IPCA", annualPercent: 4.5 },
};

/** Adapter que só sabe simular a carta DEPOIS que uma busca a pôs no índice —
 * exatamente o `offerIndex` do `BeviSelfContractAdapter`. */
function adapterComIndiceVazio() {
	const buscas: SearchGroupsParams[] = [];
	let noIndice: string | null = null;
	return {
		buscas,
		adapter: {
			searchGroups: async (params: SearchGroupsParams) => {
				buscas.push(params);
				noIndice = CARTA_RESTAURADA.id;
				return [CARTA_RESTAURADA];
			},
			simulateQuota: async (params: { groupId: string; creditValue: number }) => {
				if (params.groupId !== noIndice) throw new GroupNotInDiscoveryError(params.groupId);
				return SIMULACAO;
			},
		},
	};
}

function ctxDoTurno(over: Partial<ContextoDasTools> = {}): ContextoDasTools {
	return {
		conversationId: "conv-fecho-b",
		channel: "web",
		userText: null,
		nomeDoCliente: null,
		cards: [],
		falasDoFecho: [],
		cartasNaTela: [],
		gruposRevelados: new Map(),
		pediuHumano: false,
		estadoDepoisDaBusca: null,
		...over,
	};
}

type ToolChamavel = { execute: (input: unknown, opts: unknown) => Promise<unknown> };

async function chamarTool(
	ctx: ContextoDasTools,
	nome: string,
	input: Record<string, unknown>,
): Promise<unknown> {
	const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;
	return tools[nome]?.execute(input, { toolCallId: "call-1", messages: [] });
}

describe("L15/P133 — a simulação da carta restaurada usa a carta REAL", () => {
	it("prova o defeito: com o índice vazio a simulação estoura o GroupNotInDiscoveryError", async () => {
		const { adapter } = adapterComIndiceVazio();
		await expect(
			adapter.simulateQuota({ groupId: CARTA_RESTAURADA.id, creditValue: 92_902 }),
		).rejects.toBeInstanceOf(GroupNotInDiscoveryError);
	});

	it("carta fora do índice: re-busca pelo valor NOMINAL dela e simula de novo", async () => {
		const { adapter, buscas } = adapterComIndiceVazio();

		const sim = await simularCotaDaCarta({
			adapter,
			params: { groupId: CARTA_RESTAURADA.id, creditValue: 92_902 },
			grupo: CARTA_RESTAURADA,
		});

		expect(sim).toEqual(SIMULACAO);
		expect(buscas).toEqual([
			{ category: "auto", creditMax: 92_902, creditMin: Math.round(92_902 * 0.9) },
		]);
	});

	it("sem a carta na mão o erro SOBE — não se inventa simulação de id desconhecido", async () => {
		const { adapter, buscas } = adapterComIndiceVazio();

		await expect(
			simularCotaDaCarta({
				adapter,
				params: { groupId: "cota-desconhecida", creditValue: 92_902 },
				grupo: undefined,
			}),
		).rejects.toBeInstanceOf(GroupNotInDiscoveryError);
		expect(buscas).toEqual([]);
	});

	it("o turno entrega a carta restaurada ao adapter — é ela que repõe o índice", () => {
		const fonte = readFileSync(new URL("./tools-livres.ts", import.meta.url).pathname, "utf8");
		expect(fonte).toMatch(/grupo: ctx\.gruposRevelados\.get\(params\.groupId\)/);
	});

	it("`mostrar_card simulation_result` devolve o card com os números da administradora", async () => {
		const ctx = ctxDoTurno({
			gruposRevelados: new Map([[CARTA_RESTAURADA.id, CARTA_RESTAURADA]]),
		});
		const tools = buildToolsLivres(ctx, {
			simularCota: async () => SIMULACAO,
		}) as unknown as Record<string, ToolChamavel>;
		const saida = await tools.mostrar_card?.execute(
			{ tipo: "simulation_result", payload: { groupId: CARTA_RESTAURADA.id } },
			{ toolCallId: "call-sim", messages: [] },
		);

		expect(String(saida)).toContain("[Card simulation_result na tela");
		const card = ctx.cards[0];
		expect(card?.type).toBe("simulation_result");
		expect(card?.payload.creditValue).toBe(SIMULACAO.creditValue);
		expect(card?.payload.totalCost).toBe(SIMULACAO.totalCost);
	});
});

describe("L19/P274 — o status REAL da proposta por PESSOA", () => {
	it("a consulta é da pessoa (a proposta pode estar em outra conversa)", async () => {
		mocks.pessoaDaConversa.mockResolvedValue({ contactId: "contato-1" });
		mocks.ultimaPropostaDaPessoa.mockResolvedValue({ id: "row-1", proposalId: "PROP-9" });
		mocks.checkProposalStatus.mockResolvedValue({
			ok: true,
			hasProposal: true,
			userMessage: "Sua proposta está em análise inicial na administradora.",
			statusName: "Espera Consulta Consórcio",
			situation: "em análise",
			integrationCode: null,
			approvedAt: null,
			reprovedAt: null,
			lastTransition: null,
		});

		const saida = await chamarTool(ctxDoTurno(), "status_da_proposta", {});

		expect(String(saida)).toContain("Sua proposta está em análise inicial na administradora.");
		// O registro procurado é o da pessoa: o `getProposalImpl` que chega ao
		// consultor de status resolve pela proposta dela, não pela conversa.
		const [, deps] = mocks.checkProposalStatus.mock.calls[0] as [
			string,
			{ getProposalImpl?: (conversationId: string) => Promise<unknown> },
		];
		expect(deps.getProposalImpl).toBeTypeOf("function");
		await expect(deps.getProposalImpl?.("conv-fecho-b")).resolves.toEqual({
			id: "row-1",
			proposalId: "PROP-9",
		});
		expect(mocks.ultimaPropostaDaPessoa).toHaveBeenCalledWith("contato-1");
	});

	it("sem contato resolvido, cai no caminho por conversa (nada de pessoa inventada)", async () => {
		mocks.pessoaDaConversa.mockResolvedValue(null);
		mocks.checkProposalStatus.mockResolvedValue({
			ok: true,
			hasProposal: false,
			userMessage: "Você ainda não tem uma proposta criada por aqui.",
		});

		const saida = await chamarTool(ctxDoTurno(), "status_da_proposta", {});

		expect(String(saida)).toContain("ainda não tem uma proposta");
		const [, deps] = mocks.checkProposalStatus.mock.calls.at(-1) as [
			string,
			{ getProposalImpl?: unknown },
		];
		expect(deps).toEqual({});
	});
});

describe("R5.4 — a lista de cards oferecida depende do CANAL", () => {
	it("no WhatsApp o value_picker nem aparece para o modelo", () => {
		const { escolha } = tiposDeCardDoCanal("whatsapp");
		expect(escolha).toEqual(["quick_reply", "topic_picker"]);

		const zap = buildToolsLivres(ctxDoTurno({ channel: "whatsapp" }));
		expect(zap.mostrar_card.description).not.toContain("value_picker");
		const shape = zap.mostrar_card.inputSchema as unknown as {
			shape: { tipo: { description: string } };
		};
		expect(shape.shape.tipo.description).not.toContain("value_picker");
	});

	it("na web o value_picker continua oferecido", () => {
		const { escolha } = tiposDeCardDoCanal("web");
		expect(escolha).toEqual(["quick_reply", "value_picker", "topic_picker"]);

		const web = buildToolsLivres(ctxDoTurno());
		expect(web.mostrar_card.description).toContain("value_picker");
	});

	it("os 15 cards de FATO continuam todos oferecidos, nos dois canais", () => {
		const fatoEsperado = Object.entries(DESTINO_DOS_CARDS)
			.filter(([, d]) => d.classe === "emitivel" && d.origem === "fato")
			.map(([tipo]) => tipo);
		// `scenarios` é card de FATO montado de `cenarios.ts` e TEM renderer nos dois
		// canais (web: components/chat/artifacts/scenarios.tsx; WhatsApp:
		// whatsapp/formatter.ts → scenariosToWhatsApp), então não some por canal.
		expect(fatoEsperado).toHaveLength(15);
		expect(fatoEsperado).toContain("scenarios");
		for (const channel of ["web", "whatsapp"] as const) {
			expect(tiposDeCardDoCanal(channel).fato.sort()).toEqual(fatoEsperado.sort());
		}
	});
});

describe("CHIPS 1 — o atalho do card sai com o groupId CONFERIDO", () => {
	it("cota real viaja no atalho; id inventado cai", async () => {
		// A conferência de `coerceEscolhaNosAtalhos` exige mais de uma cota na tela e
		// rótulo que resolva para a cota declarada — é ela que assina o atalho.
		const irma: GroupSummary = {
			...CARTA_RESTAURADA,
			id: "cota-irma",
			creditValue: 80_000,
			monthlyPayment: 1_120,
			termMonths: 120,
		};
		const ctx = ctxDoTurno({
			gruposRevelados: new Map([
				[CARTA_RESTAURADA.id, CARTA_RESTAURADA],
				[irma.id, irma],
			]),
		});

		const saida = await chamarTool(ctx, "mostrar_card", {
			tipo: "quick_reply",
			payload: {
				options: [
					{ label: "a de menor parcela", groupId: irma.id },
					{ label: "a de prazo mais curto", groupId: CARTA_RESTAURADA.id },
					{ label: "essa outra", groupId: "cota-inventada" },
				],
			},
		});

		expect(String(saida)).toContain("[Card quick_reply na tela");
		const options = ctx.cards[0]?.payload.options as Array<{
			label: string;
			groupId?: string;
			replyId?: string;
		}>;
		expect(options.map((o) => o.groupId)).toEqual([irma.id, CARTA_RESTAURADA.id, undefined]);
		for (const option of options) expect(option.replyId).toMatch(/^[0-9a-f-]{36}$/);
	});
});

describe("CHIPS 2 — o contract_form na tela prova o despacho do formulário", () => {
	it("mostrar_card contract_form deixa contractFormDispatched no contexto do turno", async () => {
		const ctx = ctxDoTurno();

		const saida = await chamarTool(ctx, "mostrar_card", { tipo: "contract_form", payload: {} });

		expect(String(saida)).toContain("[Card contract_form na tela");
		expect(ctx.metaDaEmissao).toEqual({ contractFormDispatched: true });
	});

	it("card que não prova estado nenhum não escreve nada", async () => {
		const ctx = ctxDoTurno({
			gruposRevelados: new Map([[CARTA_RESTAURADA.id, CARTA_RESTAURADA]]),
		});

		await chamarTool(ctx, "mostrar_card", {
			tipo: "group_card",
			payload: { groupId: CARTA_RESTAURADA.id },
		});

		expect(ctx.metaDaEmissao).toBeUndefined();
	});
});
