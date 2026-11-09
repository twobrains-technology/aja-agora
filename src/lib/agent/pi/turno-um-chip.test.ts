// UM CARD POR TURNO, NO ÚLTIMO BALÃO — os prints 07 e 08 do dono.
//
// Defeito medido na conversa web `1a4927bd-78a9-4fa0-9510-9550a7b583c5` (27/10/2026, 20:49:07 e
// 20:50:21) e cobrado pelo líder às 18:08: o chip era decidido a cada TRECHO do turno
// (`soltarTrecho`), então o toque saía com as opções do primeiro balão e pousava embaixo do
// segundo — o cliente lia a mesma pergunta em dois balões (print 07) e a pergunta que pedia o
// toque chegava sem nada para tocar (print 08).
//
// O que estes testes provam, pelo caminho real do turno (stream + banco):
//  · 1 card no turno inteiro, e ele vem DEPOIS do último balão;
//  · as opções são as da ÚLTIMA pergunta, não as da primeira (por isso cada cenário tem dois
//    balões que pedem respostas DIFERENTES: é a única forma de ver de qual balão o toque saiu);
//  · 09/11 (P11, bugs 5/6/9/10): o servidor NÃO adivinha atalho. Só a lista que o modelo escreveu
//    na fala vira toque; pergunta aberta, pedido de dado e turno sem pergunta saem SEM card de
//    toque do servidor (o card de digitar é do modelo, via `mostrar_card`).
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages, usoDeIa } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { type ScriptedBeat, subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	vi.unstubAllEnvs();
	for (const id of criadas.splice(0)) {
		await db.delete(usoDeIa).where(eq(usoDeIa.conversationId, id));
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

async function novaConversa(): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
		.returning({ id: conversations.id });
	criadas.push(conv.id);
	return conv.id;
}

const cartas: GroupSummary[] = [
	{
		id: "grupo-canopus-1",
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 90_000,
		monthlyPayment: 1_176.39,
		adminFeePercent: 20.8,
		termMonths: 96,
		totalParticipants: 900,
		availableSlots: 3,
	},
];

async function rodarTurno(args: {
	conversationId: string;
	userText: string;
	beats: readonly ScriptedBeat[];
}): Promise<{ eventos: TurnEvent[]; fechar: () => Promise<void> }> {
	const servidor = await subirServidorRoteirizado(args.beats);
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
		busca: async () => cartas,
	});
	const eventos: TurnEvent[] = [];
	for await (const ev of run({
		channel: "web",
		conversationId: args.conversationId,
		userText: args.userText,
		isUserTurn: true,
		contactName: null,
	}))
		eventos.push(ev);
	return { eventos, fechar: servidor.fechar };
}

/** Os cards de toque do turno — é UM, sempre. */
const chips = (eventos: TurnEvent[]) => {
	const deToque = eventos.filter(
		(e) =>
			e.type === "artifact" &&
			["quick_reply", "value_picker", "topic_picker"].includes(e.artifactType),
	);
	return deToque.map((e) =>
		e.type === "artifact"
			? ((e.payload as { options?: Array<{ label: string }> }).options?.map((o) => o.label) ??
				(e.payload as { category?: string }).category ??
				[])
			: [],
	);
};

/** O índice do card de toque e o da fala que o explica. */
const indiceDoChip = (eventos: TurnEvent[]) =>
	eventos.findIndex(
		(e) =>
			e.type === "artifact" &&
			["quick_reply", "value_picker", "topic_picker"].includes(e.artifactType),
	);
const indiceDaFala = (eventos: TurnEvent[], trecho: string) =>
	eventos.findIndex((e) => e.type === "text-delta" && e.text.includes(trecho));

describe("(print 07) o chip é UM por turno e sai no ÚLTIMO balão", () => {
	const beatsComLista = [
		{
			text: "Quanto cabe na parcela por mês? Me diz que eu já busco as cartas.",
			toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }],
		},
		{
			toolCalls: [
				{
					name: "mostrar_card",
					args: { tipo: "comparison_table", payload: { ids: ["grupo-canopus-1"] } },
				},
			],
		},
		{ text: "Você tem reserva guardada para dar lance?\n1) Tenho sim\n2) Agora não" },
	];

	it("dois beats: 1 card, depois do segundo balão, com a lista escrita no segundo", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "e como funciona esse lance? vale a pena dar lance?",
			beats: beatsComLista,
		});
		await turno.fechar();

		const primeiroBalao = indiceDaFala(turno.eventos, "Quanto cabe na parcela por mês?");
		const segundoBalao = indiceDaFala(turno.eventos, "Você tem reserva guardada");
		const chip = indiceDoChip(turno.eventos);

		expect(chips(turno.eventos)).toHaveLength(1);
		expect(primeiroBalao).toBeGreaterThan(-1);
		expect(segundoBalao).toBeGreaterThan(primeiroBalao);
		expect(chip).toBeGreaterThan(segundoBalao);
		// As opções são as ESCRITAS pelo modelo na última fala, nunca as da primeira pergunta.
		expect(chips(turno.eventos)[0]).toEqual(["Tenho sim", "Agora não"]);
	});

	it("a ORDEM que fica no banco é a que o cliente vê: fala → card → fala → chips", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "e como funciona esse lance? vale a pena dar lance?",
			beats: beatsComLista,
		});
		await turno.fechar();

		const linhas = await db
			.select({ role: messages.role, content: messages.content })
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
			.orderBy(messages.createdAt);
		const ordem = linhas
			.filter((l) => l.role === "assistant")
			.map((l) =>
				l.content.startsWith("[card: ") ? l.content.replace(/^\[card: |\]$/g, "") : "fala",
			);
		expect(ordem).toEqual(["fala", "comparison_table", "fala", "quick_reply"]);
	});
});

describe("(09/11) o servidor não adivinha atalho", () => {
	it("pergunta final aberta com cartas na tela: nenhum card de toque do servidor (print 08, bug 10)", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "tenho uns 20 mil guardados",
			beats: [
				{
					text: "Obrigado! Com R$ 20 mil de reserva, dá para usar como lance livre.",
					toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }],
				},
				{
					toolCalls: [
						{
							name: "mostrar_card",
							args: { tipo: "comparison_table", payload: { ids: ["grupo-canopus-1"] } },
						},
					],
				},
				{
					text: "Qual dessas cartas você quer seguir? A Canopus de R$ 90 mil é a que eu recomendo.",
				},
			],
		});
		await turno.fechar();

		expect(indiceDaFala(turno.eventos, "Qual dessas cartas")).toBeGreaterThan(-1);
		expect(chips(turno.eventos)).toEqual([]);
	});

	it("turno sem pergunta: nenhum card de toque", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro",
			beats: [{ text: "Perfeito, já anotei tudo e vou buscar as cartas." }],
		});
		await turno.fechar();

		expect(chips(turno.eventos)).toEqual([]);
	});

	it("pedido de dado (valor, WhatsApp, CPF) em texto: sem atalho que responda outra pergunta", async () => {
		for (const fala of [
			"Pode me mandar o CPF e o celular escritos aqui mesmo? Se for a Canopus, eu já gero a proposta.",
			"Para fechar a proposta, me manda seu CPF e seu celular.",
			"Qual é o valor do carro que você está pensando em comprar?",
		]) {
			const conversationId = await novaConversa();
			const turno = await rodarTurno({
				conversationId,
				userText: "pode ser a de 90 mil",
				beats: [{ text: fala }],
			});
			await turno.fechar();
			expect(chips(turno.eventos), fala).toEqual([]);
		}
	});
});
