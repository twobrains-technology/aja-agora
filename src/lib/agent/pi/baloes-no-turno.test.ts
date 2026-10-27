// A CONVERSA PICADA NO CANAL — o caminho real do turno (stream + banco), não só a função pura.
//
// `baloes.test.ts` prova a divisão; aqui se prova o ENCANAMENTO: um beat do modelo com quatro
// frases chega ao cliente como bolhas separadas, cada uma com a sua fronteira (web fecha o
// balão, WhatsApp manda mensagem nova, a persistência grava uma linha por balão), sem perder
// caractere e sem mexer no toque do fim do turno.
//
// O defeito medido nos prints 07/08 (`.orientacao/prints-ux/`): o parágrafo de lance — 7 a 9
// linhas dentro de UM balão — foi um beat só, e o cliente leu textão.
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

/** A fala do turno em BALÕES, como o canal a desenha: um balão por fronteira. */
const baloes = (eventos: TurnEvent[]): string[] => {
	const saida: string[] = [];
	let atual = "";
	for (const ev of eventos) {
		if (ev.type === "text-delta") atual += ev.text;
		if (ev.type === "text-boundary" || ev.type === "artifact") {
			if (atual.trim()) saida.push(atual.trim());
			atual = "";
		}
	}
	if (atual.trim()) saida.push(atual.trim());
	return saida;
};

/** O parágrafo do print 07, transcrito da tela. */
const EXPLICACAO_DE_LANCE =
	'Lance é um valor que você oferece para ser chamado antes, numa assembleia do grupo. Há dois tipos: **Lance livre:** você paga do seu bolso. Quanto maior, maior a chance de ser contemplado antes. Mas a contemplação continua sem data certa. **Lance embutido:** sai da própria carta, então você recebe um crédito menor. Não tira dinheiro do seu bolso, mas o carro fica um pouco mais "curto". Se vale a pena depende de você ter ou não uma reserva para o lance e de quanto você precisa do carro agora. Você tem algum valor guardado para isso?';

describe("(print 07) um beat longo chega ao cliente em bolhas curtas", () => {
	it("o parágrafo de lance vira 2 ou 3 balões, sem perder texto", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "e como funciona esse lance?",
			beats: [{ text: EXPLICACAO_DE_LANCE }],
		});
		await turno.fechar();

		const falados = baloes(turno.eventos);
		// Antes: UM balão com o parágrafo inteiro. Agora: conversa picada.
		expect(falados.length).toBeGreaterThanOrEqual(2);
		expect(falados.length).toBeLessThanOrEqual(3);
		for (const balao of falados) expect(balao.length, balao).toBeLessThanOrEqual(200);
		// Nada do que o modelo escreveu se perde na picagem.
		const normalizar = (t: string) => t.replace(/\s+/g, " ").trim();
		expect(normalizar(falados.join(" "))).toBe(normalizar(EXPLICACAO_DE_LANCE));
	});

	it("o toque do turno continua UM e no fim, depois do último balão", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "e como funciona esse lance?",
			beats: [{ text: EXPLICACAO_DE_LANCE }],
		});
		await turno.fechar();

		const deToque = turno.eventos.filter(
			(e) =>
				e.type === "artifact" &&
				["quick_reply", "value_picker", "topic_picker"].includes(e.artifactType),
		);
		expect(deToque).toHaveLength(1);
		const ultimoBalao = turno.eventos.findLastIndex((e) => e.type === "text-delta");
		const chip = turno.eventos.findIndex(
			(e) =>
				e.type === "artifact" &&
				["quick_reply", "value_picker", "topic_picker"].includes(e.artifactType),
		);
		expect(chip).toBeGreaterThan(ultimoBalao);
	});
});

describe("a conversa picada chega ao banco como chegou à tela", () => {
	it("uma linha por balão: recarregar a página não desfaz a picagem", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "e como funciona esse lance?",
			beats: [{ text: EXPLICACAO_DE_LANCE }],
		});
		await turno.fechar();

		const linhas = await db
			.select({ role: messages.role, content: messages.content })
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
			.orderBy(messages.createdAt);
		const falas = linhas
			.filter((l) => l.role === "assistant" && !l.content.startsWith("[card: "))
			.map((l) => l.content);
		// Um balão na tela = uma linha no banco (a retomada reconstrói pela ordem de criação).
		expect(falas.length).toBeGreaterThanOrEqual(2);
		expect(falas).toHaveLength(baloes(turno.eventos).length);
	});
});

describe("a fala curta não é picada", () => {
	it("uma frase de WhatsApp continua UM balão", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro",
			beats: [{ text: "Fechou! Já anotei aqui e vou buscar as cartas para você." }],
		});
		await turno.fechar();

		expect(baloes(turno.eventos)).toEqual([
			"Fechou! Já anotei aqui e vou buscar as cartas para você.",
		]);
	});
});
