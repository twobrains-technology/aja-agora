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

	it("'dou 20k de entrada' não é lance (fora dos moldes, onda 17); 'quero um de 80 mil, qual o lance?' não é", () => {
		// lado seguro: fora dos moldes (onda 17) — `entrada` não é molde de lance
		expect(lanceEPrazoDoTurno("dou 20k de entrada")).toEqual({});
		expect(lanceEPrazoDoTurno("meu lance é de 30 mil")).toEqual({ lanceValue: 30_000 });
		expect(lanceEPrazoDoTurno("tenho 30 mil pro lance")).toEqual({ lanceValue: 30_000 });
		// O número ao lado do marcador aqui é o VALOR DO BEM, dito na mesma frase
		// de uma pergunta sobre o lance.
		expect(lanceEPrazoDoTurno("quero um de 80 mil, qual o lance?")).toEqual({});
	});
});

describe("P139 — pergunta e negativa NÃO são dinheiro disponível", () => {
	it("'não tenho 30 mil para lance' não é dinheiro do cliente", () => {
		// Sem reserva anterior não há o que zera: a negação derruba a CAPTURA (P139) e a
		// tabela continua lendo assim. Com reserva persistida, a mesma fala ZERA a reserva —
		// ver o describe da rodada 9, abaixo.
		expect(lanceEPrazoDoTurno("não tenho 30 mil para lance")).toEqual({});
		// E o número ligado à negativa do lance também não é o valor do bem.
		expect(declaracaoDoTurno("não tenho 30 mil para lance")).toEqual({});
	});

	it("'preciso ter 30 mil de lance?' é pergunta, não declaração", () => {
		expect(lanceEPrazoDoTurno("preciso ter 30 mil de lance?")).toEqual({});
		expect(declaracaoDoTurno("preciso ter 30 mil de lance?")).toEqual({});
	});

	it("a trava é da MENSAGEM inteira: negação em qualquer frase derruba o lance", () => {
		// RODADA 6: a trava é da mensagem, não da frase. "Não tenho 30 mil de lance.
		// Meu lance é de 10 mil" continua pendente — o modelo pergunta de novo em vez
		// de os cenários usarem uma reserva que a própria fala põe em dúvida.
		expect(lanceEPrazoDoTurno("não tenho 30 mil de lance, mas tenho 10 mil")).toEqual({});
		expect(lanceEPrazoDoTurno("não tenho 30 mil de lance. meu lance é de 10 mil")).toEqual({});
		// A metade positiva, sozinha, vale: é ela que a trava estava derrubando.
		expect(lanceEPrazoDoTurno("meu lance é de 10 mil")).toEqual({ lanceValue: 10_000 });
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

	// RODADA 6 / P139 — "faltam 30 mil" atravessava a lista de negações da onda 15
	// e entrava como recurso próprio. É o dinheiro que falta, não o que o cliente
	// tem: os cenários passavam a usar uma reserva inexistente.
	it("o turno com 'faltam 30 mil' chega aos cenários SEM dinheiro do cliente", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "Ainda faltam 30 mil para o lance.",
			card: { tipo: "scenarios", payload: { groupId: CARTA.id } },
		});
		await turno.fechar();

		// Morde: gravado, o `provavel` carregaria 30 mil de quem disse que ainda
		// precisa deles. Sem isso, o cenário é o de sempre.
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

	// RODADA 8 / P139 — o lado perigoso do embutido: o dinheiro é da CARTA. No turno completo,
	// ele não pode entrar como recurso próprio nos três cenários.
	it("o turno com o lance declarado como EMBUTIDO chega aos cenários SEM dinheiro do cliente", async () => {
		const fala = "Meu lance é 30 mil, tudo embutido.";
		expect(lanceEPrazoDoTurno(fala)).toEqual({});

		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: fala,
			card: { tipo: "scenarios", payload: { groupId: CARTA.id } },
		});
		await turno.fechar();

		// Morde: sem a trava do embutido, `lanceDeclarado` alimentava `ownCashAvailable`
		// (`cenarios.ts:47`) e o `provavel` carregava 30 mil do bolso de quem disse que o
		// dinheiro é da carta. Sem ele, o cenário é o de sempre — o embutido cobre o lance.
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
		// lado seguro: fora dos moldes (onda 17) — `entrada` não é molde de lance
		{ fala: "dou 20 mil de entrada", lance: {}, bem: {} },
		// Caixa alta e emoji: o cliente digita assim no WhatsApp.
		{ fala: "MEU LANCE: 30 MIL", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "tenho 30 mil de lance 😉", lance: { lanceValue: 30_000 }, bem: {} },
		// lado seguro: fora dos moldes (onda 17) — `o lance` sem `meu` não fecha molde 3
		{ fala: "o lance é 30 mil!", lance: {}, bem: {} },
		// Lance em PERGUNTA — o cliente quer saber, não declarou ter.
		{ fala: "30 mil de lance?", lance: {}, bem: {} },
		{ fala: "30 mil de lance???", lance: {}, bem: {} },
		// Paridade com a main também no BEM (P212): `parseAssetValue` roda sobre o
		// texto ORIGINAL (`a2bc3024:src/lib/agent/orchestrator/analyze.ts:230`) e aqui
		// o 30 mil está numa oração SEM marcador — a máscara do lance não o alcança,
		// então ele é lido como valor do bem, como a main lia. O que não se grava é o
		// LANCE: pergunta não é afirmação de posse (P139).
		{ fala: "Quanto de lance? 30 mil?", lance: {}, bem: { valorDoBem: 30_000 } },
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
		// Bem + lance na MESMA frase, nas duas ordens. O verbo dos moldes é `dou`, e o
		// dinheiro que ele nomeia é o da ENTRADA: o bem continua, o lance não entra.
		{
			fala: "quero um carro de 80 mil e dou 20 mil de entrada",
			// lado seguro: fora dos moldes (onda 17)
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "dou 20 mil de entrada pra um carro de 80 mil",
			// lado seguro: fora dos moldes (onda 17)
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "meu lance: 30 mil, quero um carro de 80 mil",
			lance: { lanceValue: 30_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// Dois dinheiros de lance na MESMA frase: o segundo não pode sobrar para o
		// parser do bem. (`entrada de 10 mil` é masked do bem, mas não é molde de lance.)
		{
			fala: "lance de 30 mil e entrada de 10 mil pra um carro de 80 mil",
			// lado seguro: fora dos moldes (onda 17)
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// `e`/`ou` ligam FRASES: cada marcador fica com o dinheiro que ele rotula.
		// Moldes 1 e 3 fecham aqui; o dinheiro da `entrada` sai do bem mas não é lance.
		{ fala: "tenho 30 mil pro lance e 20 mil de entrada", lance: { lanceValue: 30_000 }, bem: {} },
		{ fala: "meu lance: 30mil, entrada: 10mil", lance: { lanceValue: 30_000 }, bem: {} },
		{
			fala: "meu lance é 30 mil e o carro é 80 mil",
			lance: { lanceValue: 30_000 },
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// RODADA 6 / P139 — marcar o dinheiro como sendo do lance NÃO é dizer que o
		// cliente o tem. Sem verbo de posse, o lado seguro é não gravar o lance — e o
		// preço do bem continua sendo o bem.
		{
			fala: "quero um carro de 80 mil com 20 mil de lance",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "80 mil de carro, 30 mil de lance",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		// O que o cliente diz sem pontuação nenhuma e o que ele só pergunta.
		// lado seguro: fora dos moldes (onda 17) — verbo de intenção, não dos moldes
		{ fala: "o lance seria de uns 30 mil", lance: {}, bem: {} },
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
		// lado seguro: fora dos moldes (onda 17) — `lance de 30 mil` não é molde
		{
			fala: "Quero um carro de 80 mil, lance de 30 mil",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "Consigo dar 20 mil de entrada, quero um carro de 80 mil",
			// lado seguro: fora dos moldes (onda 17) — verbo de molde, mas `de entrada`
			lance: {},
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
		// Fragmento nu: o número é do lance e sai do caminho do bem, mas ninguém
		// AFIRMOU tê-lo — o caso clássico de "quanto de lance?" respondido só com o
		// número (P139, rodada 6).
		{ fala: "80 mil de lance", lance: {}, bem: {} },
		// RODADA 6 / P212 — o vão LARGO sem afirmação é o preço do bem dito perto da
		// palavra: a máscara do lance não pode levá-lo junto.
		{
			fala: "quero um carro de 80 mil sem entrada",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "Quanto de entrada pra um carro de 80 mil?",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},
		{
			fala: "o carro de 80 mil tem lance de quanto?",
			lance: {},
			bem: { categoria: "auto", valorDoBem: 80_000 },
		},

		// RODADA 6 / P139 — a TRAVA DA MENSAGEM. Falta, obrigação, hipótese e
		// pergunta disfarçada são o dinheiro que o cliente NÃO tem; a onda 15
		// enumerava negações e cada rodada trazia uma forma nova. Depois da trava,
		// nada na mensagem vira lance.
		{ fala: "Ainda faltam 30 mil para o lance.", lance: {}, bem: {} },
		{ fala: "faltam 30 mil de entrada", lance: {}, bem: {} },
		{ fala: "tenho que dar 30 mil de lance", lance: {}, bem: {} },
		{ fala: "teria que dar 30 mil de entrada", lance: {}, bem: {} },
		{ fala: "preciso de 30 mil de lance", lance: {}, bem: {} },
		{ fala: "a entrada exige 30 mil", lance: {}, bem: {} },
		{ fala: "sou obrigado a dar 30 mil de lance", lance: {}, bem: {} },
		{ fala: "se eu der 30 mil de lance, quanto fica a parcela?", lance: {}, bem: {} },
		{ fala: "caso eu dê 30 mil de entrada", lance: {}, bem: {} },
		{ fala: "eu teria 30 mil de lance", lance: {}, bem: {} },
		{ fala: "sem 30 mil de entrada não dá", lance: {}, bem: {} },
		{ fala: "zero de entrada", lance: {}, bem: {} },
		{ fala: "nunca juntei 30 mil de lance", lance: {}, bem: {} },

		// RODADA 8 / P139 — `embutido` na trava da MENSAGEM: o dinheiro vem da CARTA, não do
		// bolso dele. Mesmo com o molde 3 fechado, nada na fala vira recurso próprio.
		{ fala: "Meu lance é 30 mil, tudo embutido.", lance: {}, bem: {} },
		{ fala: "meu lance é de 30 mil, tudo embutido no plano", lance: {}, bem: {} },
		// A metade positiva continua valendo sem a palavra embutido.
		{ fala: "meu lance é de 30 mil", lance: { lanceValue: 30_000 }, bem: {} },

		// RODADA 6 / P139 — as formas POSITIVAS da permissão, uma por verbete. Na onda 17
		// só os três moldes gravam lance e `entrada` não é molde: cada linha abaixo que
		// está fora dos moldes passou a esperar `{}`.
		// lado seguro: fora dos moldes (onda 17) — `pra entrada`, não `pra lance`
		{ fala: "guardei 30 mil pra entrada", lance: {}, bem: {} },
		{ fala: "disponho de 30 mil de lance", lance: { lanceValue: 30_000 }, bem: {} },
		// lado seguro: fora dos moldes (onda 17) — `juntar` e `entrada` não são formas do molde
		{ fala: "consigo juntar 30 mil de entrada", lance: {}, bem: {} },
		// lado seguro: fora dos moldes (onda 17) — `oferecer` não é forma do molde
		{ fala: "posso oferecer 30 mil de lance", lance: {}, bem: {} },
		// lado seguro: fora dos moldes (onda 17) — `entrada` não é molde de lance
		{ fala: "vou dar 30 mil de entrada", lance: {}, bem: {} },
		// lado seguro: fora dos moldes (onda 17) — `daria` não é forma do molde
		{ fala: "eu daria 30 mil de lance", lance: {}, bem: {} },
		// lado seguro: fora dos moldes (onda 17) — gordura entre o dinheiro e o gancho: não
		// fecha molde, mas o número OBJETO do verbo de posse continua fora do preço do bem (P212)
		{ fala: "tenho 30 mil guardados pro lance", lance: {}, bem: {} },
		// lado seguro: fora dos moldes (onda 17) — `como entrada`, não `como lance`
		{ fala: "tenho 30 mil como entrada", lance: {}, bem: {} },
	];

	it.each(casos)("«$fala»", ({ fala, lance, bem }) => {
		expect(lanceEPrazoDoTurno(fala)).toEqual(lance);
		expect(declaracaoDoTurno(fala)).toEqual(bem);
	});
});

// RODADA 9 / P139 — a CORREÇÃO e a RETIRADA substituem a reserva antiga.
//
// Os testes de veracidade descartavam o zero, e a negativa e o embutido só derrubavam a
// CAPTURA: os três cenários continuavam usando o dinheiro que o cliente corrigiu ou retirou.
// Agora a trava de NEGAÇÃO e a do EMBUTIDO zeram a reserva — mas só quando já existe reserva
// persistida. Falas isoladas, sem reserva anterior, continuam sem gravar lance: é como a tabela
// acima a lê — "quero um carro de 80 mil, sem entrada" é o preço do BEM perto da palavra, não
// uma retirada — e a asserção é sobre a TRANSIÇÃO.
//
// Os casos rodam dois turnos na MESMA conversa, até o card: `ownResourcesValue` do `provavel` é
// o dinheiro que o cenário diria que o cliente tem, e `qualifyAnswers.lanceValue` é o estado.
describe("P139 (rodada 9) — a transição zera a reserva anterior, até o card", () => {
	type Transicao = {
		antesCard: Record<string, unknown> | undefined;
		depoisCard: Record<string, unknown> | undefined;
		qualify: Record<string, unknown>;
	};

	function bolsoDoCard(payload: Record<string, unknown> | undefined): number {
		return (payload?.scenarios as { provavel: { ownResourcesValue: number } }).provavel
			.ownResourcesValue;
	}

	async function transicao(declara: string, depois: string): Promise<Transicao> {
		const conversationId = await novaConversa();
		const card = { tipo: "scenarios" as const, payload: { groupId: CARTA.id } };

		const primeiro = await rodarTurno({ conversationId, userText: declara, card });
		await primeiro.fechar();
		const segundo = await rodarTurno({ conversationId, userText: depois, card });
		await segundo.fechar();

		return {
			antesCard: cardDoTurno(primeiro.eventos, "scenarios"),
			depoisCard: cardDoTurno(segundo.eventos, "scenarios"),
			qualify: await qualifyDa(conversationId),
		};
	}

	// (a) O zero capturado é escrito. Morde: com o teste de veracidade, o zero é descartado e
	// os 30 mil anteriores permanecem — a `main` preserva o zero (`qualify-state.ts:225`).
	it("«Meu lance: R$ 0» depois de «Tenho 30 mil de lance» é zero", async () => {
		const t = await transicao("Tenho 30 mil de lance.", "Meu lance: R$ 0");
		// O primeiro turno é o que sempre funcionou: o dinheiro declarado entra no card.
		expect(t.antesCard).toEqual(cenariosDaCarta(CARTA, { lanceDeclarado: 30_000 }));
		expect(t.qualify.lanceValue).toBe(0);
		// O card do segundo turno é o de sempre: nenhum recurso próprio.
		expect(t.depoisCard).toEqual(cenariosDaCarta(CARTA));
		expect(bolsoDoCard(t.depoisCard)).toBe(0);
	});

	// (b) A negativa sobre o lance ZERA a reserva. A negação sozinha não capturava nada e a
	// reserva de antes continuava viva; agora ela sobrescreve.
	it("«30 mil de lance eu não tenho» zera a reserva de 30 mil", async () => {
		const t = await transicao("Tenho 30 mil de lance.", "30 mil de lance eu não tenho.");
		expect(t.qualify.lanceValue).toBe(0);
		expect(bolsoDoCard(t.depoisCard)).toBe(0);
	});

	// Zerar não exige número na fala: o MARCADOR basta, porque é o marcador que diz de quem é o
	// dinheiro que ele está negando.
	it("«De lance, não tenho nada.» zera a reserva de 30 mil", async () => {
		const t = await transicao("Tenho 30 mil de lance.", "De lance, não tenho nada.");
		expect(t.qualify.lanceValue).toBe(0);
		expect(bolsoDoCard(t.depoisCard)).toBe(0);
	});

	// O embutido é o outro lado da mesma trava: o dinheiro é da CARTA, não do bolso dele.
	it("«Meu lance é 30 mil, tudo embutido» zera a reserva de 30 mil", async () => {
		const t = await transicao("Tenho 30 mil de lance.", "Meu lance é 30 mil, tudo embutido.");
		expect(t.qualify.lanceValue).toBe(0);
		expect(bolsoDoCard(t.depoisCard)).toBe(0);
	});

	// (c) As outras travas (pergunta, obrigação/falta, hipótese) NÃO mexem na reserva: derrubam a
	// captura, não o que já foi gravado.
	it("«preciso ter 50 mil de lance?» não mexe na reserva de 30 mil", async () => {
		const t = await transicao("Tenho 30 mil de lance.", "preciso ter 50 mil de lance?");
		expect(t.qualify.lanceValue).toBe(30_000);
		// O card continua o do turno anterior: a pergunta não mexe na reserva.
		expect(t.depoisCard).toEqual(t.antesCard);
		expect(bolsoDoCard(t.depoisCard)).toBeGreaterThan(0);
	});

	// Morde: sem a trava de negação/embutido, os cinco casos acima ficam com 30000; sem o teste
	// de PRESENÇA, só o zero capturado volta a ser descartado.
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
