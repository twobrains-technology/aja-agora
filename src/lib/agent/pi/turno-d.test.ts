// O QUE O TURNO PRECISA VOLTAR A PRODUZIR — onda 12, bloco TURNO-D.
//
// Cada `describe` é uma linha da re-auditoria (reauditoria3-310e.md) com o seu
// teste, pelo caminho real do turno (stream + banco), não pela expressão:
//
//  · P136 — o card de ESCOLHA sai DEPOIS do texto do turno que traz a pergunta,
//    enquanto o card FACTUAL continua saindo na ordem do stream (P157);
//  · P273 — o livro-caixa grava o cache MEDIDO do beat, zero incluído; `null` é
//    reservado ao "não medido".
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages, usoDeIa } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre, somarUsoDosBeats } from "./turno-livre";

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
];

/** Um turno inteiro, com o "modelo" roteirizado e a busca falsa na fronteira. */
async function rodarTurno(args: {
	conversationId: string;
	userText: string;
	beats: Parameters<typeof subirServidorRoteirizado>[0];
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

const indiceDoCard = (eventos: TurnEvent[], tipo: string) =>
	eventos.findIndex(
		(e) => e.type === "artifact" && (e as { artifactType: string }).artifactType === tipo,
	);
const indiceDaFala = (eventos: TurnEvent[], trecho: string) =>
	eventos.findIndex((e) => e.type === "text-delta" && e.text.includes(trecho));

// ── P136 ────────────────────────────────────────────────────────────────────
//
// Na `main` o chip era a RESPOSTA de uma pergunta: o texto vinha primeiro e as
// opções, no fim do balão (`tools/ai-sdk.ts:887`). Com o pi, a skill manda o
// modelo chamar `mostrar_card` ANTES de escrever a pergunta, e a emissão na
// ordem do stream entregava os botões antes do texto que lhes dá sentido (na web
// a pergunta aparecia embaixo das opções; no WhatsApp, em mensagem anterior).
describe("P136 — o card de ESCOLHA sai depois da pergunta, o factual na ordem do stream", () => {
	it("o turno produz fala → card factual → pergunta → chips", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [
				{
					text: "Boa! Um carro de 80 mil é bem possível.",
					toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto" } }],
				},
				{
					toolCalls: [
						{
							name: "mostrar_card",
							args: {
								tipo: "quick_reply",
								payload: { options: [{ label: "Até 80 mil" }, { label: "Até 120 mil" }] },
							},
						},
					],
				},
				{ text: "Qual dessas faixas fica melhor pra você?" },
			],
		});
		await turno.fechar();

		const abertura = indiceDaFala(turno.eventos, "Boa!");
		const tabela = indiceDoCard(turno.eventos, "comparison_table");
		const pergunta = indiceDaFala(turno.eventos, "Qual dessas faixas");
		const chips = indiceDoCard(turno.eventos, "quick_reply");

		// O card FACTUAL continua onde nasceu: no resultado da ferramenta (P157).
		expect(tabela).toBeGreaterThan(abertura);
		expect(tabela).toBeLessThan(pergunta);
		// E o card de ESCOLHA vem DEPOIS da pergunta que ele responde (P136).
		expect(chips).toBeGreaterThan(pergunta);
		// Os dois saem uma vez só, e cada um abre balão próprio (R5.1).
		expect(turno.eventos.filter((e) => e.type === "artifact")).toHaveLength(2);
		expect(turno.eventos[chips - 1]?.type).toBe("text-boundary");
	});

	it("a persistência grava a mesma ordem: a pergunta antes dos chips", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [
				{
					toolCalls: [
						{
							name: "mostrar_card",
							args: {
								tipo: "quick_reply",
								payload: { options: [{ label: "Sim" }, { label: "Não" }] },
							},
						},
					],
				},
				{ text: "Você já tem o dinheiro do lance?" },
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
				l.content.startsWith("[card: quick_reply]")
					? "chips"
					: l.content.startsWith("[card: ")
						? "card"
						: "fala",
			);
		expect(ordem).toEqual(["fala", "chips"]);
	});
});

// ── P273 ────────────────────────────────────────────────────────────────────
describe("P273 — o livro-caixa grava o cache MEDIDO do beat (zero incluído)", () => {
	it("provedor que reporta zero grava 0, não null", async () => {
		vi.stubEnv("AI_MODEL", "claude-haiku-4-5");
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "oi, quero um carro",
			beats: [
				{
					text: "Oi! O que você quer comprar?",
					usage: {
						prompt_tokens: 80_000,
						completion_tokens: 0,
						cacheRead: 0,
						cacheWrite: 0,
					},
				},
			],
		});
		await turno.fechar();

		const linhas = await db
			.select()
			.from(usoDeIa)
			.where(eq(usoDeIa.conversationId, conversationId));
		expect(linhas).toHaveLength(1);
		// Zero é MEDIÇÃO ("nenhum token veio do cache"), e é o que deixa o custo
		// calculável. `null` diria "não medido" e o leitor trataria o turno como
		// desconhecido.
		expect(linhas[0]?.tokensCacheRead).toBe(0);
		expect(linhas[0]?.tokensCacheWrite).toBe(0);
		expect(linhas[0]?.custoUsdCents).not.toBeNull();
	});

	it("o cache de vários beats é somado; zero medido sobrevive à soma", () => {
		const modelo = "claude-haiku-4-5";
		const uso = somarUsoDosBeats([
			{ modelo, tokensInput: 1_000, tokensOutput: 10, cacheRead: 0, cacheWrite: 0 },
			{ modelo, tokensInput: 2_000, tokensOutput: 20, cacheRead: 0, cacheWrite: 0 },
		]);
		expect(uso.cacheRead).toBe(0);
		expect(uso.cacheWrite).toBe(0);
	});

	it("nenhum beat medindo cache é 'NÃO MEDIDO' — null, nunca zero", () => {
		const uso = somarUsoDosBeats([
			{ modelo: "claude-haiku-4-5", tokensInput: 1_000, tokensOutput: 10 },
		]);
		expect(uso.cacheRead).toBeNull();
		expect(uso.cacheWrite).toBeNull();
	});
});
