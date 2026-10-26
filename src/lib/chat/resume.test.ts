// RETOMADA — as partes voltam na ORDEM em que foram para a tela.
//
// O defeito que estes testes prendem é o do refresh: o card de comparação saía
// entre os textos ao vivo (R5.1) e reaparecia no FIM da conversa quando a página
// era recarregada, porque o payload de retomada só carregava `content` + UM
// `artifact` por mensagem e o cliente remontava sempre [texto, card].
//
// A ordem vem do que já está gravado: cada balão de fala e cada linha marcadora
// de card são linhas de `messages` na ordem de criação, e o card é o artifact
// ligado à linha marcadora (`conversation/cards.ts`).
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { artifacts, conversations, messages } from "@/db/schema";
import { buildResumableMessages, getResumableConversation, type ResumeRow } from "./resume";

const COOKIE = "cookie-de-teste-da-retomada";
const criadas: string[] = [];

afterEach(async () => {
	for (const id of criadas.splice(0)) {
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

async function conversaComHistorico(): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: "active",
			isSimulated: true,
			metadata: { webCookie: COOKIE },
		})
		.returning({ id: conversations.id });
	criadas.push(conv.id);

	const base = Date.parse("2026-10-20T12:00:00.000Z");
	const linhas: Array<{ role: "user" | "assistant"; content: string; card?: string }> = [
		{ role: "user", content: "Quero um carro de uns 80 mil." },
		{ role: "assistant", content: "Achei estas opções pra você:" },
		{ role: "assistant", content: "[card: comparison_table]", card: "comparison_table" },
		{ role: "assistant", content: "Qual delas te agrada mais?" },
	];
	for (const [i, linha] of linhas.entries()) {
		const [msg] = await db
			.insert(messages)
			.values({
				conversationId: conv.id,
				role: linha.role,
				content: linha.content,
				channel: "web",
				createdAt: new Date(base + i * 1000),
			})
			.returning({ id: messages.id });
		if (linha.card) {
			await db.insert(artifacts).values({
				messageId: msg.id,
				type: linha.card,
				payload: { carta: "ITAÚ" },
				createdAt: new Date(base + i * 1000),
			});
		}
	}
	return conv.id;
}

describe("buildResumableMessages — as partes na ordem persistida", () => {
	it("um turno texto → card → texto volta como UM assistente com as três partes nessa ordem", () => {
		const linhas: ResumeRow[] = [
			{ id: "m1", role: "user", content: "Quero um carro.", artifacts: [] },
			{ id: "m2", role: "assistant", content: "Achei estas opções:", artifacts: [] },
			{
				id: "m3",
				role: "assistant",
				content: "[card: comparison_table]",
				artifacts: [{ type: "comparison_table", payload: { carta: "ITAÚ" } }],
			},
			{ id: "m4", role: "assistant", content: "Qual te agrada mais?", artifacts: [] },
		];

		expect(buildResumableMessages(linhas)).toEqual([
			{ id: "m1", role: "user", parts: [{ type: "text", text: "Quero um carro." }] },
			{
				id: "m2",
				role: "assistant",
				parts: [
					{ type: "text", text: "Achei estas opções:" },
					{ type: "artifact", artifactType: "comparison_table", payload: { carta: "ITAÚ" } },
					{ type: "text", text: "Qual te agrada mais?" },
				],
			},
		]);
	});

	it("marcador de card NUNCA vira fala do agente", () => {
		const mensagens = buildResumableMessages([
			{ id: "m1", role: "assistant", content: "[card: scarcity]", artifacts: [] },
			{ id: "m2", role: "assistant", content: "[card: decision_prompt]", artifacts: [] },
		]);

		expect(mensagens).toEqual([]);
	});

	it("fala do CLIENTE nunca é agrupada com a do agente", () => {
		const mensagens = buildResumableMessages([
			{ id: "m1", role: "assistant", content: "Boa!", artifacts: [] },
			{ id: "m2", role: "user", content: "Quero 80 mil.", artifacts: [] },
			{ id: "m3", role: "assistant", content: "Anotado.", artifacts: [] },
		]);

		expect(mensagens.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
	});
});

describe("getResumableConversation — retomada com o card no meio", () => {
	it("devolve [texto, card, texto] do turno em que o card saiu entre as falas", async () => {
		await conversaComHistorico();

		const conv = await getResumableConversation(COOKIE);

		expect(conv?.messages).toEqual([
			{
				id: expect.any(String),
				role: "user",
				parts: [{ type: "text", text: "Quero um carro de uns 80 mil." }],
			},
			{
				id: expect.any(String),
				role: "assistant",
				parts: [
					{ type: "text", text: "Achei estas opções pra você:" },
					{ type: "artifact", artifactType: "comparison_table", payload: { carta: "ITAÚ" } },
					{ type: "text", text: "Qual delas te agrada mais?" },
				],
			},
		]);
	});

	it("sem cookie ou sem conversa do cookie → primeira vez (null)", async () => {
		await conversaComHistorico();

		expect(await getResumableConversation(null)).toBeNull();
		expect(await getResumableConversation("outro-device")).toBeNull();
	});
});
