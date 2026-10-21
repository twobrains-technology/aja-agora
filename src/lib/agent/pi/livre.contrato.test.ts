// O CONTRATO DO MOTOR LIVRE.
//
// Prova, sem Bevi e sem modelo de verdade, o que o mandato exige:
//  · o turno fala (o texto chega AO VIVO no stream);
//  · NENHUM evento `gate` existe — funil fora;
//  · o card nasce do RESULTADO da tool, não de uma `cards do funil`;
//  · a busca grava categoria e reveal na meta;
//  · a fala do cliente é persistida em `messages`.
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

describe("motor livre — vendedor sem funil", () => {
	it("fala, busca pelo resultado da tool e NÃO emite gate", async () => {
		const conversationId = await novaConversa();
		const servidor = await subirServidorRoteirizado([
			{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }] },
			{ text: "Achei essas opções pra você: a ITAÚ e o Banco do Brasil." },
		]);

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

			const texto = eventos
				.filter((e) => e.type === "text-delta")
				.map((e) => (e as { text: string }).text)
				.join("");
			expect(texto).toContain("Achei essas opções");

			const gates = eventos.filter((e) => e.type === "gate");
			expect(gates).toHaveLength(0);

			const cards = eventos.filter(
				(e) =>
					e.type === "artifact" &&
					(e as { artifactType: string }).artifactType === "comparison_table",
			);
			expect(cards).toHaveLength(1);
			const payload = (cards[0] as { payload: { groups?: unknown[] } }).payload;
			expect(payload.groups).toHaveLength(2);

			const [conv] = await db
				.select({ metadata: conversations.metadata })
				.from(conversations)
				.where(eq(conversations.id, conversationId));
			const meta = (conv.metadata ?? {}) as Record<string, unknown>;
			expect(meta.currentCategory).toBe("auto");
			expect(meta.revealCompleted).toBe(true);

			const msgs = await db
				.select({ role: messages.role, content: messages.content })
				.from(messages)
				.where(eq(messages.conversationId, conversationId));
			expect(msgs.some((m) => m.role === "user" && m.content.includes("carro de 80 mil"))).toBe(
				true,
			);
			expect(msgs.some((m) => m.role === "assistant" && m.content.includes("Achei"))).toBe(true);
		} finally {
			await servidor.fechar();
		}
	});

	it("WhatsApp produz a MESMA trilha: texto + card, zero gate", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "whatsapp", status: "active", isSimulated: true, contactName: null })
			.returning({ id: conversations.id });
		criadas.push(conv.id);
		const servidor = await subirServidorRoteirizado([
			{ toolCalls: [{ name: "buscar_cartas", args: { categoria: "auto", valorDoBem: 80_000 } }] },
			{ text: "Olha o que achei pro seu caso." },
		]);
		try {
			const run = createRunTurnLivre({
				provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
				busca: async () => cartas,
			});
			const eventos: TurnEvent[] = [];
			for await (const ev of run({
				channel: "whatsapp",
				conversationId: conv.id,
				userText: "quero um carro de 80 mil",
				isUserTurn: true,
				contactName: null,
			}))
				eventos.push(ev);

			expect(eventos.filter((e) => e.type === "gate")).toHaveLength(0);
			expect(
				eventos.filter(
					(e) =>
						e.type === "artifact" &&
						(e as { artifactType: string }).artifactType === "comparison_table",
				),
			).toHaveLength(1);
			const meta = await db
				.select({ metadata: conversations.metadata })
				.from(conversations)
				.where(eq(conversations.id, conv.id));
			expect(((meta[0]?.metadata ?? {}) as Record<string, unknown>).currentCategory).toBe("auto");
		} finally {
			await servidor.fechar();
		}
	});

	it("sem busca, o vendedor ainda responde — e nenhum card aparece", async () => {
		const conversationId = await novaConversa();
		const servidor = await subirServidorRoteirizado([
			{ text: "Que bom! Me conta: carro, moto, imóvel ou serviços?" },
		]);
		try {
			const run = createRunTurnLivre({
				provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
				busca: async () => [],
			});
			const eventos: TurnEvent[] = [];
			for await (const ev of run({
				channel: "web",
				conversationId,
				userText: "oi",
				isUserTurn: true,
				contactName: null,
			}))
				eventos.push(ev);

			expect(eventos.filter((e) => e.type === "artifact")).toHaveLength(0);
			expect(eventos.some((e) => e.type === "text-delta")).toBe(true);
		} finally {
			await servidor.fechar();
		}
	});
});
