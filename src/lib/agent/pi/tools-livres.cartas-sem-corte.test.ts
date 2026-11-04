// CARTAS SEM CORTE (D-0076, F1) — a busca devolve TUDO ao agente e não põe nada
// na tela; quem escolhe quais cartas (e quantas) vão ao card é o agente, com
// `mostrar_card(comparison_table, { ids })`. P10/P11: o código só garante a verdade
// (o id existe na busca), nenhum teto, nenhuma dedup.
import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildToolsLivres, type ContextoDasTools, inputDoFecho, metaDoFecho } from "./tools-livres";

function grupo(n: number, over: Partial<GroupSummary> = {}): GroupSummary {
	return {
		id: `g${n}`,
		administradora: n % 2 ? "Canopus" : "Itaú",
		category: "auto",
		creditValue: 60_000 + n * 1_000,
		monthlyPayment: 700 + n,
		adminFeePercent: 17,
		termMonths: 80 + n,
		totalParticipants: 900,
		availableSlots: 5,
		ofertaId: `oferta-${n}`,
		avgBidValue: 12_000,
		tipoOferta: "grupo",
		grupo: `7${n}`,
		...over,
	};
}

function novoCtx(over: Partial<ContextoDasTools> = {}): ContextoDasTools {
	return {
		conversationId: "conv-sem-corte",
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

type Tool = { execute: (input: unknown, opts: unknown) => Promise<unknown> };

function ferramentas(ctx: ContextoDasTools, grupos: GroupSummary[]) {
	const tools = buildToolsLivres(ctx, {
		buscarGrupos: async () => grupos,
		carregarLogos: async () => new Map(),
	}) as unknown as Record<string, Tool>;
	const chamar = async (nome: string, args: unknown): Promise<string> => {
		const saida = await tools[nome].execute(args, { toolCallId: `call-${nome}`, messages: [] });
		return typeof saida === "string" ? saida : JSON.stringify(saida);
	};
	return {
		buscar: (args: Record<string, unknown> = { categoria: "auto" }) =>
			chamar("buscar_cartas", args),
		mostrar: (payload?: Record<string, unknown>) =>
			chamar("mostrar_card", { tipo: "comparison_table", payload }),
	};
}

const trinta = Array.from({ length: 30 }, (_, i) => grupo(i + 1));
const idsDoCard = (ctx: ContextoDasTools) =>
	(
		ctx.cards.find((c) => c.type === "comparison_table")?.payload.groups as Array<{ id: string }>
	).map((g) => g.id);

describe("buscar_cartas devolve tudo e não põe nada na tela", () => {
	it("30 grupos → 30 cartas, com todos os campos da Bevi", async () => {
		const ctx = novoCtx();
		const saida = JSON.parse(await ferramentas(ctx, trinta).buscar()) as {
			cartas: Array<Record<string, unknown>>;
			obs: string;
		};
		expect(saida.cartas).toHaveLength(30);
		expect(saida.cartas[0]).toMatchObject({
			groupId: "g1",
			administradora: "Canopus",
			carta: 61_000,
			parcela: 701,
			prazoMeses: 81,
			contempladosMes: 5,
			category: "auto",
			adminFeePercent: 17,
			totalParticipants: 900,
			availableSlots: 5,
			ofertaId: "oferta-1",
			avgBidValue: 12_000,
			tipoOferta: "grupo",
			grupo: "71",
		});
		expect(saida.obs).toMatch(/mostrar_card/);
	});

	it("sozinha, não empurra card nem muda o que está na tela", async () => {
		const ctx = novoCtx();
		await ferramentas(ctx, trinta).buscar();
		expect(ctx.cards.filter((c) => c.type === "comparison_table")).toHaveLength(0);
		expect(ctx.cards).toHaveLength(0);
		expect(ctx.gruposRevelados.size).toBe(0);
		expect(ctx.cartasNaTela).toHaveLength(0);
		expect(ctx.gruposDaBusca?.size).toBe(30);
		expect(ctx.estadoDepoisDaBusca?.categoria).toBe("auto");
	});
});

describe("mostrar_card(comparison_table, { ids })", () => {
	it("mostra exatamente os ids pedidos, na ordem, e ancora a tela neles", async () => {
		const ctx = novoCtx();
		const f = ferramentas(ctx, trinta);
		await f.buscar();
		await f.mostrar({ ids: ["g7", "g2", "g20"] });
		expect(idsDoCard(ctx)).toEqual(["g7", "g2", "g20"]);
		expect(ctx.cartasNaTela.map((c) => c.groupId)).toEqual(["g7", "g2", "g20"]);
		expect([...ctx.gruposRevelados.keys()].sort()).toEqual(["g2", "g20", "g7"]);
	});

	it("não corta: 30 ids → 30 linhas", async () => {
		const ctx = novoCtx();
		const f = ferramentas(ctx, trinta);
		await f.buscar();
		await f.mostrar({ ids: trinta.map((g) => g.id) });
		expect(idsDoCard(ctx)).toHaveLength(30);
	});

	it("id fora da busca → recusa em texto, nenhum card", async () => {
		const ctx = novoCtx();
		const f = ferramentas(ctx, trinta);
		await f.buscar();
		const texto = await f.mostrar({ ids: ["g1", "inventado"] });
		expect(texto).toContain("inventado");
		expect(ctx.cards).toHaveLength(0);
		expect(ctx.cartasNaTela).toHaveLength(0);
	});

	it("sem ids ou ids vazio → recusa que ensina o uso", async () => {
		const ctx = novoCtx();
		const f = ferramentas(ctx, trinta);
		await f.buscar();
		for (const payload of [undefined, {}, { ids: [] }]) {
			expect(await f.mostrar(payload)).toMatch(/ids/);
		}
		expect(ctx.cards).toHaveLength(0);
	});

	it("id repetido → uma linha só, na primeira posição", async () => {
		const ctx = novoCtx();
		const f = ferramentas(ctx, trinta);
		await f.buscar();
		await f.mostrar({ ids: ["g3", "g1", "g3"] });
		expect(idsDoCard(ctx)).toEqual(["g3", "g1"]);
	});

	it("no turno seguinte, vale a carta restaurada do que o cliente já viu", async () => {
		const restaurada = grupo(5);
		const ctx = novoCtx({ gruposRevelados: new Map([[restaurada.id, restaurada]]) });
		const f = ferramentas(ctx, []);
		await f.mostrar({ ids: ["g5"] });
		expect(idsDoCard(ctx)).toEqual(["g5"]);
		expect(ctx.cartasNaTela.map((c) => c.groupId)).toEqual(["g5"]);
	});

	it("id que nunca foi buscado nem mostrado → recusa", async () => {
		const ctx = novoCtx({ gruposRevelados: new Map([["g5", grupo(5)]]) });
		const texto = await ferramentas(ctx, []).mostrar({ ids: ["g9"] });
		expect(texto).toContain("g9");
		expect(ctx.cards).toHaveLength(0);
	});
});

describe("duplicata Canopus 80 mil (hipóteses do plano)", () => {
	it("(A) dois quotaId distintos, mesma Canopus 80k, parcelas 977,12 e 977,40: o dado fica, o agente escolhe", async () => {
		const a = grupo(1, {
			id: "q-a",
			administradora: "Canopus",
			creditValue: 80_000,
			monthlyPayment: 977.12,
			termMonths: 100,
		});
		const b = grupo(2, {
			id: "q-b",
			administradora: "Canopus",
			creditValue: 80_000,
			monthlyPayment: 977.4,
			termMonths: 100,
		});
		const ctx = novoCtx();
		const f = ferramentas(ctx, [a, b]);
		const saida = JSON.parse(await f.buscar()) as { cartas: Array<{ groupId: string }> };
		expect(saida.cartas.map((c) => c.groupId)).toEqual(["q-a", "q-b"]);
		await f.mostrar({ ids: ["q-a", "q-b"] });
		expect(idsDoCard(ctx)).toEqual(["q-a", "q-b"]);
		ctx.cards.length = 0;
		await f.mostrar({ ids: ["q-b"] });
		expect(idsDoCard(ctx)).toEqual(["q-b"]);
	});

	it("(B) duas buscas no mesmo turno não geram card sozinhas: a repetição passa a ser decisão do agente", async () => {
		const ctx = novoCtx();
		const f = ferramentas(ctx, trinta.slice(0, 3));
		await f.buscar();
		await f.buscar();
		expect(ctx.cards.filter((c) => c.type === "comparison_table")).toHaveLength(0);
		await f.mostrar({ ids: ["g1", "g2"] });
		expect(ctx.cards.filter((c) => c.type === "comparison_table")).toHaveLength(1);
		expect(idsDoCard(ctx)).toEqual(["g1", "g2"]);
	});
});

describe("fazer_proposta ancora no que o agente mostrou", () => {
	it("o id escolhido via ids está em cartasNaTela; o que ficou só na busca, não", async () => {
		const ctx = novoCtx();
		const f = ferramentas(ctx, trinta);
		await f.buscar();
		await f.mostrar({ ids: ["g4"] });
		expect(ctx.cartasNaTela.some((c) => c.groupId === "g4")).toBe(true);
		expect(ctx.cartasNaTela.some((c) => c.groupId === "g5")).toBe(false);
	});
});

describe("o fecho leva o id da carta que o cliente viu (caso Renan, U1)", () => {
	it("metaDoFecho grava o groupId em contractOffer e o input leva quotaIdVista", () => {
		const meta = metaDoFecho({
			meta: {} as ConversationMetadata,
			escolhida: {
				groupId: "quota-vista-80",
				administradora: "Canopus",
				creditValue: 80_000,
				termMonths: 100,
			},
			falaDoCliente: "quero essa",
		});
		expect(meta.contractOffer?.groupId).toBe("quota-vista-80");
		const input = inputDoFecho({
			meta,
			cpf: "52998224725",
			celular: "11987654321",
			leadId: null,
			registeredAdministradora: null,
		});
		expect(input.quotaIdVista).toBe("quota-vista-80");
	});
});
