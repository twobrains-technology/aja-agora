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
//  · turno sem pergunta continua com próximo passo (ordem das 17:16).
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
	it("dois beats perguntando coisas diferentes: 1 card, depois do segundo balão, com as opções do segundo", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "e como funciona esse lance? vale a pena dar lance?",
			beats: [
				{
					text: "Quanto cabe na parcela por mês? Me diz que eu já busco as cartas.",
					toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }],
				},
				{ text: "Você tem alguma reserva guardada para dar lance, ou prefere usar só o embutido?" },
			],
		});
		await turno.fechar();

		const primeiroBalao = indiceDaFala(turno.eventos, "Quanto cabe na parcela por mês?");
		const segundoBalao = indiceDaFala(turno.eventos, "Você tem alguma reserva guardada");
		const chip = indiceDoChip(turno.eventos);

		// UM card de toque em todo o turno.
		expect(chips(turno.eventos)).toHaveLength(1);
		// E ele vem DEPOIS do segundo balão, não atrás do primeiro.
		expect(primeiroBalao).toBeGreaterThan(-1);
		expect(segundoBalao).toBeGreaterThan(primeiroBalao);
		expect(chip).toBeGreaterThan(segundoBalao);
		// As opções respondem à ÚLTIMA pergunta (o lance que ele já tem) — antes vinham as da
		// faixa de PARCELA, do primeiro balão, penduradas embaixo do segundo.
		expect(chips(turno.eventos)[0]).toEqual([
			"Tenho sim, consigo dar lance",
			"Tenho pouco",
			"Agora não tenho",
		]);
	});

	it("a ORDEM que fica no banco é a que o cliente vê: fala → card → fala → chips", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "e como funciona esse lance? vale a pena dar lance?",
			beats: [
				{
					text: "Quanto cabe na parcela por mês? Me diz que eu já busco as cartas.",
					toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }],
				},
				{ text: "Você tem alguma reserva guardada para dar lance, ou prefere usar só o embutido?" },
			],
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
		// A tabela de cartas sai no resultado da busca (P157); o toque, no FIM do turno.
		expect(ordem).toEqual(["fala", "comparison_table", "fala", "quick_reply"]);
	});
});

describe("(print 08) a pergunta final é a que ganha o toque", () => {
	it("o card fica com o balão que pergunta qual carta seguir, não com o anterior", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "tenho uns 20 mil guardados. meu cpf e 111.444.777-35",
			beats: [
				{
					text: "Obrigado! Com R$ 20 mil de reserva, dá para usar como lance livre e ter mais chance de ser chamado cedo.",
					toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }],
				},
				{
					text: "Qual dessas cartas você quer seguir? A Canopus de R$ 90 mil é a que eu recomendo para o seu caso.",
				},
			],
		});
		await turno.fechar();

		const anterior = indiceDaFala(turno.eventos, "Com R$ 20 mil de reserva");
		const pergunta = indiceDaFala(turno.eventos, "Qual dessas cartas você quer seguir?");
		const chip = indiceDoChip(turno.eventos);

		expect(chips(turno.eventos)).toHaveLength(1);
		expect(pergunta).toBeGreaterThan(anterior);
		expect(chip).toBeGreaterThan(pergunta);
		// A pergunta "qual dessas cartas você quer seguir?" chega COM toque do lado dela: antes o
		// único card do turno respondia ao balão anterior (lance/entrada) e a pergunta ficava órfã.
		// E os toques são os da PERGUNTA: escolher entre as cartas da tela (ordem do líder 18:08,
		// item 3) — "Pode seguir" era resposta genérica para uma escolha entre cartas.
		expect(chips(turno.eventos)[0]).toEqual([
			"Quero essa",
			"Ver outra opção",
			"Como funciona o lance?",
		]);
	});
});

describe("(ordem das 17:16) turno sem pergunta continua com próximo passo", () => {
	it("um balão sem '?' ganha 1 card de próximos passos, no fim", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro",
			beats: [{ text: "Perfeito, já anotei tudo e vou buscar as cartas." }],
		});
		await turno.fechar();

		const fala = indiceDaFala(turno.eventos, "já anotei tudo");
		expect(chips(turno.eventos)).toEqual([["Quero ver as opções", "Tenho uma dúvida"]]);
		expect(indiceDoChip(turno.eventos)).toBeGreaterThan(fala);
	});
});

describe("(R21) o pedido de dado no BEAT ÚNICO — pedido e fecho na mesma resposta", () => {
	// Defeito medido no SHA `e2461a52`: com o pedido de CPF/celular e o fecho na MESMA resposta do
	// agente, o único card do turno saía genérico (`Pode seguir` · `Tenho uma dúvida`) ou de oferta
	// (`Quero essa` · `Ver outra opção` · `Falar do lance`). A decisão olhava o texto inteiro ou só
	// a última frase, e a frase que PEDE o dado podia ser a primeira.
	it("pedido com '?' + fecho afirmativo no mesmo balão: o card é do DADO", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "pode ser a de 90 mil",
			beats: [
				{
					text: "Pode me mandar o CPF e o celular escritos aqui mesmo? Se for a Canopus de 96 meses que eu recomendei, eu já gero a proposta no seu nome.",
				},
			],
		});
		await turno.fechar();

		expect(chips(turno.eventos)).toHaveLength(1);
		const opcoes = chips(turno.eventos)[0] as string[];
		expect(opcoes.join(" | ")).toMatch(/cpf|celular/i);
		expect(opcoes).not.toContain("Pode seguir");
		expect(opcoes).not.toContain("Quero essa");
	});

	it("pedido + fecho sem '?' no mesmo balão: o card é do DADO, nunca 'Quero essa'", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "pode ser a de 90 mil",
			beats: [{ text: "Pode me mandar o CPF e o celular. Vou gerar a proposta." }],
		});
		await turno.fechar();

		expect(chips(turno.eventos)).toHaveLength(1);
		const opcoes = chips(turno.eventos)[0] as string[];
		expect(opcoes.join(" | ")).toMatch(/cpf|celular/i);
		expect(opcoes).not.toContain("Quero essa");
	});
});

describe("(R20) o toque sai do ÚLTIMO PEDIDO do turno, não do último balão", () => {
	// Defeito medido no SHA `3236f59f` (auditoria independente da R20, 237 turnos): o pedido de
	// CPF/celular saía num balão e o fecho ("Tudo bem, aguardo.") noutro. O toque nascia do fecho
	// — que não pede nada — e saía `Quero essa` · `Ver outra opção` · `Falar do lance` embaixo de
	// "me manda seu CPF e seu celular". Agora a derivação olha o TURNO INTEIRO, de trás pra
	// frente, até o balão que pergunta ou pede um dado.
	it("pedido de CPF num balão + fecho no seguinte: o chip é o do CPF, no FIM do turno", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "pode ser a de 90 mil",
			beats: [
				{ text: "Para fechar a proposta, me manda seu CPF e seu celular." },
				{ text: "Tudo bem, aguardo." },
			],
		});
		await turno.fechar();

		expect(chips(turno.eventos)).toHaveLength(1);
		const opcoes = chips(turno.eventos)[0] as string[];
		expect(opcoes.join(" | ")).toMatch(/cpf|celular/i);
		expect(opcoes).not.toContain("Quero essa");
		// O card continua UM e no FIM: depois do fecho, como o cliente lê.
		expect(indiceDoChip(turno.eventos)).toBeGreaterThan(indiceDaFala(turno.eventos, "aguardo"));
	});
});
