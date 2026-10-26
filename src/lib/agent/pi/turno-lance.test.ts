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
import type { Category } from "@/lib/agent/personas";
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

	// RODADA 5 / P139 — a negação vem DEPOIS do número e o dinheiro era gravado
	// assim mesmo: a leitura só olhava para trás.
	it("'30 mil de lance eu não tenho' não é dinheiro do cliente", () => {
		expect(lanceEPrazoDoTurno("30 mil de lance eu não tenho.")).toEqual({});
		// E o número ligado à negativa do lance também não é o valor do bem.
		expect(declaracaoDoTurno("30 mil de lance eu não tenho.")).toEqual({});
	});

	it("o turno com a negativa DEPOIS do número chega aos cenários sem dinheiro do cliente", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "30 mil de lance eu não tenho.",
			card: { tipo: "scenarios", payload: { groupId: CARTA.id } },
		});
		await turno.fechar();

		// Morde: com o dinheiro gravado, o `provavel` carregaria 30 mil do bolso de
		// quem disse não tê-los. Sem ele, o cenário é o de sempre — o embutido cobre
		// o lance — e nenhum recurso próprio é usado.
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

	it("o turno com PERGUNTA de lance chega aos cenários SEM dinheiro do cliente", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "30 mil de lance?",
			card: { tipo: "scenarios", payload: { groupId: CARTA.id } },
		});
		await turno.fechar();

		// Morde: hoje o `?` se perde no corte da oração, a fala é lida como
		// declaração e o `provavel` carrega 30 mil do bolso de quem só PERGUNTOU.
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

// TABELA ADVERSARIAL (P139 + P212): a decisão é por FRASE, com a pontuação
// original preservada. Cada linha é uma fala real de cliente brasileiro e o que
// ela declara — o lance vai para o lance, o bem para o bem, e a PONTUAÇÃO (`?`,
// `:`, `-`, `=`, `,`, `.`, `!`, emoji, caixa alta) não muda a atribuição. O
// auditor achou um contraexemplo novo a cada rodada; esta tabela guarda os das
// rodadas 3, 4 e 5 e é a rede que fecha a classe.
//
// A DIREÇÃO de cada linha é explícita: o lado perigoso do lance é gravar dinheiro
// que o cliente NÃO afirmou ter; o do bem é perder o bem declarado ou tomar o
// lance como bem. As linhas seguras valem "não captura".
describe("P139/P212 — a frase decide: pontuação e rótulo não trocam lance por bem", () => {
	type Caso = {
		fala: string;
		lance: { lanceValue?: number };
		bem: { categoria?: Category; valorDoBem?: number };
	};

	const casos: Caso[] = [
		// Lance AFIRMATIVO — com preposição, rótulo e dois-pontos.
		{ fala: "tenho 30 mil de lance", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "Meu lance: R$ 30.000", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "meu lance é de 30 mil", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "meu lance - 30 mil", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "meu lance = 30 mil", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "dou 20 mil de entrada", lance: { lanceValue: 20_000 }, bem: {} },
		// Caixa alta e emoji: o cliente digita assim no WhatsApp.
		{ fala: "MEU LANCE: 30 MIL", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "tenho 30 mil de lance 😉", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "o lance é 30 mil!", lance: { lanceValue: 30_000 }, bem: {} },
		// Lance em PERGUNTA — o cliente quer saber, não declarou ter.
		{ fala: "30 mil de lance?", lance: {}, bem: {} },
		{ fala: "30 mil de lance???", lance: {}, bem: {} },
		{ fala: "Quanto de lance? 30 mil?", lance: {}, bem: {} },
		{ fala: "preciso ter 30 mil de lance?", lance: {}, bem: {} },
		// Lance NEGADO — dizer que não tem não é ter.
		{ fala: "não tenho 30 mil de lance", lance: {}, bem: {} },
		{ fala: "NUNCA tive 30 mil de lance.", lance: {}, bem: {} },
		// Bem sozinho, com e sem pontuação.
		{ fala: "quero um carro de 80 mil", lance: {}, bem: { categoria: "auto", valorDoBem: 80_000 } },
		{
			fala: "QUERO UM CARRO DE 80 MIL!",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{ fala: "carro: 80 mil", lance: {}, bem: { categoria: "auto", valorDoBem: 80_000 } },
		// Bem SEM entrada declarada.
		{
			fala: "quero um carro de 80 mil, sem entrada",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// Bem + lance na MESMA frase, nas duas ordens.
		{
			fala: "quero um carro de 80 mil e dou 20 mil de entrada",
			lance: { lanceValue: 20_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "dou 20 mil de entrada pra um carro de 80 mil",
			lance: { lanceValue: 20_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "meu lance: 30 mil, quero um carro de 80 mil",
			lance: { lanceValue: 30_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// Dois dinheiros de lance na MESMA frase: o segundo não pode sobrar para o
		// parser do bem.
		{
			fala: "lance de 30 mil e entrada de 10 mil pra um carro de 80 mil",
			lance: { lanceValue: 30_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// `e`/`ou` ligam FRASES: cada marcador fica com o dinheiro que ele rotula.
		{ fala: "tenho 30 mil pro lance e 20 mil de entrada", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "meu lance: 30mil, entrada: 10mil", lance: { lanceValue: 30_000 }, bem: {} },
		{
			fala: "meu lance é 30 mil e o carro é 80 mil",
			lance: { lanceValue: 30_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "quero um carro de 80 mil com 20 mil de lance",
			lance: { lanceValue: 20_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "80 mil de carro, 30 mil de lance",
			lance: { lanceValue: 30_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// O que o cliente diz sem pontuação nenhuma e o que ele só pergunta.
		{ fala: "o lance seria de uns 30 mil", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "lance é 30 mil?", lance: {}, bem: {} },
		{ fala: "será que com 30 mil de lance eu consigo?", lance: {}, bem: {} },

		// RODADA 5 / P139 — a NEGAÇÃO DEPOIS do número. "30 mil de lance eu não
		// tenho" é exatamente o recurso que o cliente disse NÃO ter.
		{ fala: "30 mil de lance eu não tenho.", lance: {}, bem: {} },
		{ fala: "30 mil de lance eu nao tenho", lance: {}, bem: {} },
		{ fala: "30 mil de entrada não tenho não", lance: {}, bem: {} },
		{ fala: "meu lance não é de 30 mil", lance: {}, bem: {} },
		{ fala: "não, 30 mil de lance", lance: {}, bem: {} },
		{ fala: "30 mil de lance, nenhuma entrada", lance: {}, bem: {} },
		{ fala: "30 mil de lance até eu tenho, zero de reserva", lance: {}, bem: {} },
		{ fala: "quanto de lance com 30 mil", lance: {}, bem: {} },

		// RODADA 5 / P212 — FRASES diferentes NUNCA se juntam. O bem de 80 mil
		// continua sendo o bem, e o "não tenho" da frase seguinte não vira lance.
		{
			fala: "Quero um carro de 80 mil. Lance eu não tenho.",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "30 mil de lance eu não tenho. Quero um carro de 80 mil.",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "Quero um carro de 80 mil. Quanto de lance eu preciso?",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "Quero um carro de 80 mil. Sem entrada.",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "Não tenho entrada. Quero um carro de 80 mil.",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// A vírgula fecha a ORAÇÃO do par: o 80 mil é o preço do carro, não o lance.
		{
			fala: "Quero um carro de 80 mil, lance de 30 mil",
			lance: { lanceValue: 30_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "Consigo dar 20 mil de entrada, quero um carro de 80 mil",
			lance: { lanceValue: 20_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// `;` e `.` também são fronteira de frase.
		{
			fala: "meu lance: R$ 30.000; quero um carro de 80 mil",
			lance: { lanceValue: 30_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "meu lance é 30 mil. quero um carro de 80 mil",
			lance: { lanceValue: 30_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{ fala: "80 mil de lance", lance: { lanceValue: 80_000 }, bem: {} },
	];

	it.each(casos)("«$fala»", ({ fala, lance, bem }) => {
		expect(lanceEPrazoDoTurno(fala)).toEqual(lance);
		expect(declaracaoDoTurno(fala)).toEqual(bem);
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
