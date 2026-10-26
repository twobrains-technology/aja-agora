// A GUARDA DA NARRAÇÃO NA COSTURA DO TURNO (R5.1).
//
// `narracao.test.ts` prova a decisão (o que é anúncio, o que é fala). Este prova
// o ENCAIXE: no turno de verdade, com o "modelo" roteirizado, o balão que só
// anuncia a ferramenta não chega ao canal quando o card fala por si — e chega
// quando não há card, quando tem informação ou quando é o balão do print.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	for (const id of criadas.splice(0)) {
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
		id: "grupo-itaú-1",
		administradora: "ITAU",
		category: "auto",
		creditValue: 80_000,
		monthlyPayment: 812,
		adminFeePercent: 18,
		termMonths: 120,
		totalParticipants: 900,
		availableSlots: 12,
	},
	{
		id: "grupo-bb-2",
		administradora: "BANCO DO BRASIL",
		category: "auto",
		creditValue: 82_000,
		monthlyPayment: 790,
		adminFeePercent: 20,
		termMonths: 132,
		totalParticipants: 1200,
		availableSlots: 8,
	},
];

const BUSCA = {
	toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }],
};

/** Roda um turno com o "modelo" roteirizado e devolve o que chegou ao canal. */
async function turnoRoteirizado(beats: Parameters<typeof subirServidorRoteirizado>[0]) {
	const conversationId = await novaConversa();
	const servidor = await subirServidorRoteirizado(beats);
	try {
		const run = createRunTurnLivre({
			provider: {
				id: "litellm",
				baseUrl: servidor.url,
				apiKey: "teste",
				model: "modelo-roteirizado",
			},
			busca: async () => cartas,
		});
		const eventos: TurnEvent[] = [];
		for await (const ev of run({
			channel: "web",
			conversationId,
			userText: "quero um carro de 80 mil",
			isUserTurn: true,
			contactName: null,
		}))
			eventos.push(ev);
		return {
			falas: eventos
				.filter((e) => e.type === "text-delta")
				.map((e) => (e as { text: string }).text),
			cards: eventos.filter(
				(e) =>
					e.type === "artifact" &&
					(e as { artifactType: string }).artifactType === "comparison_table",
			),
		};
	} finally {
		await servidor.fechar();
	}
}

describe("turno livre — o anúncio da ferramenta não chega ao canal com card na tela", () => {
	it("anúncio colado ao card cai, e o card fica", async () => {
		const { falas, cards } = await turnoRoteirizado([
			BUSCA,
			{ text: "Deixa eu mostrar os detalhes dela para você:" },
		]);
		expect(cards).toHaveLength(1);
		expect(falas.join(" ")).not.toContain("Deixa eu mostrar");
		// o anúncio caiu porque o card falou: nenhuma linha de preenchimento no lugar
		expect(falas.join(" ")).not.toContain("Achei essas opções pra você");
	});

	it("fala com informação fica inteira, mesmo com card no turno", async () => {
		const { falas, cards } = await turnoRoteirizado([
			BUSCA,
			{ text: "Achei essas opções pra você: a ITAÚ e o Banco do Brasil." },
		]);
		expect(cards).toHaveLength(1);
		expect(falas.join(" ")).toContain("Achei essas opções pra você");
	});

	it("o balão do print (nome da administradora + pergunta) fica inteiro", async () => {
		const balao =
			"Ótima escolha! A carta da Canopus é sólida também.\nDeixa eu mostrar os detalhes dela para você:\nPronto! Aí estão todos os números da carta da Canopus. Você quer seguir com essa, Marcos?";
		const { falas, cards } = await turnoRoteirizado([BUSCA, { text: balao }]);
		expect(cards).toHaveLength(1);
		expect(falas.join(" ")).toContain("Ótima escolha!");
		expect(falas.join(" ")).toContain("Deixa eu mostrar os detalhes dela para você");
	});

	it("sem card no turno, o anúncio é a fala da vez e sai", async () => {
		const { falas, cards } = await turnoRoteirizado([{ text: "Só um instante." }]);
		expect(cards).toHaveLength(0);
		expect(falas.join(" ")).toContain("Só um instante.");
	});
});
