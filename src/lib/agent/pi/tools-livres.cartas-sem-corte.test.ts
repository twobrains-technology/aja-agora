// CARTAS SEM CORTE (D-0076, F1) — a busca devolve TUDO ao agente e não põe nada
// na tela; quem escolhe quais cartas (e quantas) vão ao card é o agente, com
// `mostrar_card(comparison_table, { ids })`. P10/P11: o código só garante a verdade
// (o id existe na busca), nenhum teto, nenhuma dedup.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, messages, usoDeIa } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { buildToolsLivres, type ContextoDasTools, inputDoFecho, metaDoFecho } from "./tools-livres";
import { createRunTurnLivre } from "./turno-livre";

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

describe("ids sem número completo são recusados, não descartados em silêncio", () => {
	it("recusa citando os ids descartados e não emite card menor", async () => {
		const ctx = novoCtx();
		const f = ferramentas(ctx, [grupo(1), grupo(2, { monthlyPayment: 0 }), grupo(3)]);
		await f.buscar();
		const saida = await f.mostrar({ ids: ["g1", "g2", "g3"] });
		expect(saida).toContain("g2");
		expect(saida).not.toContain('g1"');
		expect(ctx.cards.some((c) => c.type === "comparison_table")).toBe(false);
	});
});

describe("no turno, só a busca não põe card; o card nasce do mostrar_card(ids)", () => {
	const criadas: string[] = [];
	afterEach(async () => {
		for (const id of criadas.splice(0)) {
			await db.delete(usoDeIa).where(eq(usoDeIa.conversationId, id));
			await db.delete(messages).where(eq(messages.conversationId, id));
			await db.delete(conversations).where(eq(conversations.id, id));
		}
	});

	async function turno(beats: Parameters<typeof subirServidorRoteirizado>[0]) {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
			.returning({ id: conversations.id });
		criadas.push(conv.id);
		const servidor = await subirServidorRoteirizado(beats);
		const run = createRunTurnLivre({
			provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
			busca: async () => trinta.slice(0, 5),
		});
		const eventos: TurnEvent[] = [];
		for await (const ev of run({
			channel: "web",
			conversationId: conv.id,
			userText: "quero um carro",
			isUserTurn: true,
			contactName: null,
		}))
			eventos.push(ev);
		await servidor.fechar();
		return eventos.filter(
			(e) =>
				e.type === "artifact" &&
				(e as { artifactType: string }).artifactType === "comparison_table",
		) as unknown as Array<{ payload: { groups: Array<{ id: string }> } }>;
	}

	it("só buscar_cartas → zero comparison_table nos eventos", async () => {
		const cards = await turno([
			{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }] },
			{ text: "Achei cinco opções. Quer ver alguma?" },
		]);
		expect(cards).toHaveLength(0);
	});

	it("busca e depois mostrar_card(ids) em beat próprio → um comparison_table com os ids", async () => {
		const cards = await turno([
			{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }] },
			{
				toolCalls: [
					{
						name: "mostrar_card",
						args: { tipo: "comparison_table", payload: { ids: ["g2", "g4"] } },
					},
				],
			},
			{ text: "Essas duas. Qual te agrada?" },
		]);
		expect(cards).toHaveLength(1);
		expect(cards[0].payload.groups.map((g) => g.id)).toEqual(["g2", "g4"]);
	});
});
