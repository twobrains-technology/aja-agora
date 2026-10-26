// P139 — O DINHEIRO DO LANCE E O PRAZO QUE O CLIENTE DIZ NA FALA.
//
// Na `main` esses dois fatos entravam em `qualifyAnswers` pelos cards
// `lance-value` e `prazo` (`interactive-handlers.ts`): o cliente respondia e a
// chave ia para a meta. O vendedor livre não tem card de qualificação — quem
// conta é a conversa —, e ninguém gravava nenhuma das duas chaves: os três
// cenários de `cards-livres.ts` saíam como se o lance embutido cobrisse TODO o
// lance que o cliente já tinha, e o `contemplation_dial` caía no mês 6.
//
// O teste prova o comportamento pelo caminho real do turno (fala → estado →
// card), não pela expressão: o número declarado tem de aparecer no payload do
// `scenarios` e no mês-alvo do dial, e o valor do BEM não pode virar lance.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { cenariosDaCarta } from "./cenarios";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre, declaracaoDoTurno, lanceEPrazoDoTurno } from "./turno-livre";

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

async function metaDa(conversationId: string): Promise<Record<string, unknown>> {
	const [conv] = await db
		.select({ metadata: conversations.metadata })
		.from(conversations)
		.where(eq(conversations.id, conversationId));
	return (conv?.metadata ?? {}) as Record<string, unknown>;
}

async function qualifyDa(conversationId: string): Promise<Record<string, unknown>> {
	const meta = await metaDa(conversationId);
	return (meta.qualifyAnswers ?? {}) as Record<string, unknown>;
}

const CARTA: GroupSummary = {
	id: "grupo-itaú-1",
	administradora: "ITAU",
	category: "auto",
	creditValue: 80_000,
	monthlyPayment: 812,
	adminFeePercent: 18,
	termMonths: 120,
	totalParticipants: 900,
	availableSlots: 12,
};

/** Um turno inteiro: a busca põe a carta na tela, o "modelo" pede o card e
 * encerra. A fronteira da busca é falsa; o resto é o caminho de produção. */
async function rodarTurno(args: {
	conversationId: string;
	userText: string;
	card: { tipo: "scenarios" | "contemplation_dial"; payload: Record<string, unknown> };
}): Promise<{ eventos: TurnEvent[]; fechar: () => Promise<void> }> {
	const servidor = await subirServidorRoteirizado([
		{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }] },
		{ toolCalls: [{ name: "mostrar_card", args: args.card }] },
		{ text: "Pronto, olha aí." },
	]);
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
		busca: async () => [CARTA],
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

function cardDoTurno(eventos: TurnEvent[], tipo: string): Record<string, unknown> | undefined {
	const ev = eventos.find((e) => e.type === "artifact" && e.artifactType === tipo);
	return ev?.type === "artifact" ? ev.payload : undefined;
}

describe("P139 — o lance declarado na fala chega aos três cenários", () => {
	it("'tenho 30 mil de lance' entra como dinheiro do cliente no card `scenarios`", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "tenho 30 mil de lance",
			card: { tipo: "scenarios", payload: { groupId: CARTA.id } },
		});
		await turno.fechar();

		// O payload é o do montador com o lance DECLARADO: é o mesmo card que a
		// conversa mostra, não uma conta paralela do teste.
		expect(cardDoTurno(turno.eventos, "scenarios")).toEqual(
			cenariosDaCarta(CARTA, { lanceDeclarado: 30_000 }),
		);
		const provavel = (
			cardDoTurno(turno.eventos, "scenarios")?.scenarios as {
				provavel: { lanceValue: number; ownResourcesValue: number };
			}
		).provavel;
		// Morde: sem o produtor o embutido cobriria o lance inteiro e o cliente
		// entraria com ZERO do próprio bolso. O dinheiro declarado entra até o
		// tamanho do lance do cenário — cobriu todo o `provavel`.
		expect(provavel.ownResourcesValue).toBe(Math.min(30_000, provavel.lanceValue));
		expect(provavel.ownResourcesValue).toBeGreaterThan(0);

		const qualify = await qualifyDa(conversationId);
		expect(qualify.lanceValue).toBe(30_000);
	});

	it("'meu carro vale 30 mil' é valor do BEM, nunca lance", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "meu carro vale 30 mil",
			card: { tipo: "scenarios", payload: { groupId: CARTA.id } },
		});
		await turno.fechar();

		// Sem dinheiro declarado, o cenário é o de sempre (o embutido cobre o lance).
		expect(cardDoTurno(turno.eventos, "scenarios")).toEqual(cenariosDaCarta(CARTA));

		const qualify = await qualifyDa(conversationId);
		expect(qualify.lanceValue).toBeUndefined();
		expect(qualify.creditMax).toBe(80_000);
	});

	it("'dou 20k de entrada' é lance; 'quero um de 80 mil, qual o lance?' não é", () => {
		expect(lanceEPrazoDoTurno("dou 20k de entrada")).toEqual({ lanceValue: 20_000 });
		expect(lanceEPrazoDoTurno("meu lance é de 30 mil")).toEqual({ lanceValue: 30_000 });
		expect(lanceEPrazoDoTurno("tenho 30 mil pro lance")).toEqual({ lanceValue: 30_000 });
		// O número ao lado do marcador aqui é o VALOR DO BEM, dito na mesma frase
		// de uma pergunta sobre o lance.
		expect(lanceEPrazoDoTurno("quero um de 80 mil, qual o lance?")).toEqual({});
	});
});

describe("P139 — pergunta e negativa NÃO são dinheiro disponível", () => {
	it("'não tenho 30 mil para lance' não é dinheiro do cliente", () => {
		expect(lanceEPrazoDoTurno("não tenho 30 mil para lance")).toEqual({});
		// E o número ligado à negativa do lance também não é o valor do bem.
		expect(declaracaoDoTurno("não tenho 30 mil para lance")).toEqual({});
	});

	it("'preciso ter 30 mil de lance?' é pergunta, não declaração", () => {
		expect(lanceEPrazoDoTurno("preciso ter 30 mil de lance?")).toEqual({});
		expect(declaracaoDoTurno("preciso ter 30 mil de lance?")).toEqual({});
	});

	it("a negativa não apaga o que o cliente AFIRMOU na oração seguinte", () => {
		expect(lanceEPrazoDoTurno("não tenho 30 mil de lance, mas tenho 10 mil")).toEqual({});
		expect(lanceEPrazoDoTurno("não tenho 30 mil de lance. meu lance é de 10 mil")).toEqual({
			lanceValue: 10_000,
		});
	});

	it("o turno com negativa chega aos cenários SEM dinheiro do cliente", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "não tenho 30 mil para lance",
			card: { tipo: "scenarios", payload: { groupId: CARTA.id } },
		});
		await turno.fechar();

		// Morde: com o dinheiro gravado, o `provavel` carregaria 30 mil do bolso do
		// cliente. Sem ele, o cenário é o de sempre — o embutido cobre o lance.
		expect(cardDoTurno(turno.eventos, "scenarios")).toEqual(cenariosDaCarta(CARTA));
		const provavel = (
			cardDoTurno(turno.eventos, "scenarios")?.scenarios as {
				provavel: { ownResourcesValue: number };
			}
		).provavel;
		expect(provavel.ownResourcesValue).toBe(0);

		const qualify = await qualifyDa(conversationId);
		expect(qualify.lanceValue).toBeUndefined();
	});
});

describe("P139 — o prazo declarado na fala é o default do dial", () => {
	it("'em 60 meses' abre o `contemplation_dial` no mês 60", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro em 60 meses",
			card: { tipo: "contemplation_dial", payload: { groupId: CARTA.id } },
		});
		await turno.fechar();

		// O modelo não mandou mês-alvo: quem responde é o perfil declarado.
		expect(cardDoTurno(turno.eventos, "contemplation_dial")?.initialTargetMonth).toBe(60);
		const qualify = await qualifyDa(conversationId);
		expect(qualify.prazoMeses).toBe(60);
	});

	it("prazo é tempo declarado, não pagamento mensal nem idade", () => {
		expect(lanceEPrazoDoTurno("quero pagar em 2 anos")).toEqual({ prazoMeses: 24 });
		expect(lanceEPrazoDoTurno("prazo de 120 meses, por favor")).toEqual({ prazoMeses: 120 });
		expect(lanceEPrazoDoTurno("posso dar 12x")).toEqual({ prazoMeses: 12 });
		// Cadência de PAGAMENTO não é prazo, e "12 anos" solto é conversa.
		expect(lanceEPrazoDoTurno("consigo pagar 850 por mês")).toEqual({});
		expect(lanceEPrazoDoTurno("meu filho tem 12 anos")).toEqual({});
	});
});
