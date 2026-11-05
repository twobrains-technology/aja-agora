// P11 — O PERFIL DO CLIENTE CHEGA PELA TOOL `informar_perfil`.
//
// Na migração dos remendos (onda 2), a NLU em regex da fala (`declaracaoDoTurno`,
// `lanceEPrazoDoTurno`, moldes e travas) saiu do turno. Quem declara categoria,
// valor do bem, lance e prazo agora é o MODELO, pela tool `informar_perfil` — o
// servidor valida os limites e o turno grava os mesmos campos, no mesmo lugar
// (`funnel.qualifyAnswers` e `currentCategory`), com a mesma semântica de
// PRESENÇA: o lance zero é um valor válido do cliente e não pode ser descartado.
//
// Os testes abaixo provam o comportamento pelo caminho real do turno
// (tool → estado → card), substituindo os testes da NLU removida.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { cenariosDaCarta } from "./cenarios";
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

/** Um turno inteiro com o modelo roteirizado. A fronteira da busca é falsa; o resto é o
 * caminho de produção. */
async function rodarTurno(args: {
	conversationId: string;
	userText: string;
	beats: Parameters<typeof subirServidorRoteirizado>[0];
}): Promise<{ eventos: TurnEvent[]; fechar: () => Promise<void> }> {
	const servidor = await subirServidorRoteirizado(args.beats);
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

describe("P11 — `informar_perfil` grava o perfil na meta", () => {
	it("lance declarado pela tool entra em `qualifyAnswers.lanceValue`", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "tenho 30 mil de lance",
			beats: [
				{ toolCalls: [{ name: "informar_perfil", args: { lanceValue: 30_000 } }] },
				{ text: "Anotado o lance de 30 mil." },
			],
		});
		await turno.fechar();

		const qualify = await qualifyDa(conversationId);
		expect(qualify.lanceValue).toBe(30_000);
	});

	it("o lance ZERO declarado pela tool é gravado, nunca descartado", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "meu lance é zero",
			beats: [
				{ toolCalls: [{ name: "informar_perfil", args: { lanceValue: 0 } }] },
				{ text: "Anotado o lance zero." },
			],
		});
		await turno.fechar();

		const qualify = await qualifyDa(conversationId);
		expect(qualify.lanceValue).toBe(0);
	});

	it("categoria e valor do bem pela tool entram em `currentCategory` e na faixa", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "quero um carro de 80 mil",
			beats: [
				{
					toolCalls: [{ name: "informar_perfil", args: { categoria: "auto", valorDoBem: 80_000 } }],
				},
				{ text: "Anotado: carro de 80 mil." },
			],
		});
		await turno.fechar();

		const meta = await metaDa(conversationId);
		expect(meta.currentCategory).toBe("auto");
		const qualify = meta.qualifyAnswers as Record<string, unknown>;
		expect(qualify.creditMax).toBe(80_000);
		expect(qualify.valorDoBemAlvo).toBe(80_000);
	});

	it("o prazo declarado pela tool é o default do dial no turno seguinte", async () => {
		const conversationId = await novaConversa();
		const primeiro = await rodarTurno({
			conversationId,
			userText: "quero pagar em 60 meses",
			beats: [
				{ toolCalls: [{ name: "informar_perfil", args: { prazoMeses: 60 } }] },
				{ text: "Anotado o prazo de 60 meses." },
			],
		});
		await primeiro.fechar();

		const qualify = await qualifyDa(conversationId);
		expect(qualify.prazoMeses).toBe(60);

		// Turno seguinte: o modelo mostra o dial sem mandar mês-alvo — quem responde
		// é o perfil gravado do turno anterior. A carta só existe na tela depois da
		// busca e do card de comparação (o mesmo caminho de produção).
		const servidor = await subirServidorRoteirizado([
			{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }] },
			{
				toolCalls: [
					{
						name: "mostrar_card",
						args: { tipo: "comparison_table", payload: { ids: [CARTA.id] } },
					},
				],
			},
			{
				toolCalls: [
					{
						name: "mostrar_card",
						args: { tipo: "contemplation_dial", payload: { groupId: CARTA.id } },
					},
				],
			},
			{ text: "Olha o dial." },
		]);
		const run = createRunTurnLivre({
			provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
			busca: async () => [CARTA],
		});
		const eventos: TurnEvent[] = [];
		for await (const ev of run({
			channel: "web",
			conversationId,
			userText: "mostre a contemplação",
			isUserTurn: true,
			contactName: null,
		}))
			eventos.push(ev);
		await servidor.fechar();

		expect(cardDoTurno(eventos, "contemplation_dial")?.initialTargetMonth).toBe(60);
	});
});

describe("P11 — o lance da tool chega aos três cenários", () => {
	it("turno 1 grava o lance pela tool; turno 2 mostra o cenário com o dinheiro do cliente", async () => {
		const conversationId = await novaConversa();

		const primeiro = await rodarTurno({
			conversationId,
			userText: "tenho 30 mil de lance",
			beats: [
				{ toolCalls: [{ name: "informar_perfil", args: { lanceValue: 30_000 } }] },
				{ text: "Anotado o lance de 30 mil." },
			],
		});
		await primeiro.fechar();

		const servidor = await subirServidorRoteirizado([
			{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }] },
			{
				toolCalls: [
					{
						name: "mostrar_card",
						args: { tipo: "comparison_table", payload: { ids: [CARTA.id] } },
					},
				],
			},
			{
				toolCalls: [
					{
						name: "mostrar_card",
						args: { tipo: "scenarios", payload: { groupId: CARTA.id } },
					},
				],
			},
			{ text: "Olha os cenários." },
		]);
		const run = createRunTurnLivre({
			provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
			busca: async () => [CARTA],
		});
		const eventos: TurnEvent[] = [];
		for await (const ev of run({
			channel: "web",
			conversationId,
			userText: "mostre os cenários",
			isUserTurn: true,
			contactName: null,
		}))
			eventos.push(ev);
		await servidor.fechar();

		// O payload é o do montador com o lance DECLARADO: o mesmo card que a conversa
		// mostra, não uma conta paralela do teste.
		expect(cardDoTurno(eventos, "scenarios")).toEqual(
			cenariosDaCarta(CARTA, { lanceDeclarado: 30_000 }),
		);
		const provavel = (
			cardDoTurno(eventos, "scenarios")?.scenarios as {
				provavel: { lanceValue: number; ownResourcesValue: number };
			}
		).provavel;
		// Morde: sem o lance gravado, o embutido cobriria o lance inteiro e o cliente
		// entraria com zero do próprio bolso.
		expect(provavel.ownResourcesValue).toBe(Math.min(30_000, provavel.lanceValue));
		expect(provavel.ownResourcesValue).toBeGreaterThan(0);
	});

	it("a reserva de 30 mil zerada pela tool vira cenário sem dinheiro próprio", async () => {
		const conversationId = await novaConversa();

		const primeiro = await rodarTurno({
			conversationId,
			userText: "tenho 30 mil de lance",
			beats: [
				{ toolCalls: [{ name: "informar_perfil", args: { lanceValue: 30_000 } }] },
				{ text: "Anotado." },
			],
		});
		await primeiro.fechar();

		const segundo = await rodarTurno({
			conversationId,
			userText: "na verdade, lance zero pra mim",
			beats: [
				{ toolCalls: [{ name: "informar_perfil", args: { lanceValue: 0 } }] },
				{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }] },
				{
					toolCalls: [
						{
							name: "mostrar_card",
							args: { tipo: "comparison_table", payload: { ids: [CARTA.id] } },
						},
					],
				},
				{
					toolCalls: [
						{ name: "mostrar_card", args: { tipo: "scenarios", payload: { groupId: CARTA.id } } },
					],
				},
				{ text: "Olha os cenários." },
			],
		});
		await segundo.fechar();

		const qualify = await qualifyDa(conversationId);
		expect(qualify.lanceValue).toBe(0);

		// O card do segundo turno lê o zero: nenhum recurso próprio.
		expect(cardDoTurno(segundo.eventos, "scenarios")).toEqual(cenariosDaCarta(CARTA));
		const provavel = (
			cardDoTurno(segundo.eventos, "scenarios")?.scenarios as {
				provavel: { ownResourcesValue: number };
			}
		).provavel;
		expect(provavel.ownResourcesValue).toBe(0);
	});
});

describe("P11 — o turno sem a tool não inventa perfil", () => {
	it("turno sem `informar_perfil` deixa `lanceValue` fora da meta", async () => {
		const conversationId = await novaConversa();
		const turno = await rodarTurno({
			conversationId,
			userText: "meu lance é de 30 mil",
			beats: [{ text: "Anotado: 30 mil de lance." }],
		});
		await turno.fechar();

		const qualify = await qualifyDa(conversationId);
		// A fala NÃO vira lance em código: sem a tool, a meta não recebe reserva.
		expect(qualify.lanceValue).toBeUndefined();
		expect(qualify.creditMax).toBeUndefined();
		expect(qualify.prazoMeses).toBeUndefined();
	});
});
