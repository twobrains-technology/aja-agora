// A CONTAGEM de mensagens de template (integration-db).
//
// O preço é cadastro e tem unitário próprio; o que só o Postgres prova é a
// CONTAGEM — que as duas fontes (a fila de disparo e as mensagens HSM do
// painel) somem UMA vez cada, que o simulado fique de fora e que a janela de
// data corte certo.
//
// Semeia numa janela isolada (2019) para as asserções serem exatas, não "maior
// que zero". Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const JANELA_DE = new Date("2019-05-01T00:00:00Z");
const JANELA_ATE = new Date("2019-05-31T23:59:59Z");
const DENTRO = new Date("2019-05-15T12:00:00Z");
const FORA = new Date("2019-06-15T12:00:00Z");

describeIfDb("custo de mensagem — contagem por template (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let custo: typeof import("./custo-de-mensagem");

	const convIds: string[] = [];
	const queueIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		custo = await import("./custo-de-mensagem");
	});

	afterAll(async () => {
		if (queueIds.length > 0) {
			await db
				.delete(schema.whatsappOutboundQueue)
				.where(inArray(schema.whatsappOutboundQueue.id, queueIds));
		}
		if (convIds.length > 0) {
			// `messages` cai em cascade com a conversa.
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
	});

	it("soma a fila e o painel, por template, sem contar o simulado nem a janela de fora", async () => {
		const [real, simulado] = await db
			.insert(schema.conversations)
			.values([
				{ channel: "whatsapp", isSimulated: false },
				{ channel: "whatsapp", isSimulated: true },
			])
			.returning({ id: schema.conversations.id });
		convIds.push(real.id, simulado.id);

		await db.insert(schema.messages).values([
			// Painel (HSM manual): 2 do template_a, 1 do template_b.
			{
				conversationId: real.id,
				role: "assistant",
				channel: "whatsapp",
				content: "template a",
				templateName: "template_a",
				createdAt: DENTRO,
			},
			{
				conversationId: real.id,
				role: "assistant",
				channel: "whatsapp",
				content: "template a",
				templateName: "template_a",
				createdAt: DENTRO,
			},
			{
				conversationId: real.id,
				role: "assistant",
				channel: "whatsapp",
				content: "template b",
				templateName: "template_b",
				createdAt: DENTRO,
			},
			// Teste interno: NÃO entra.
			{
				conversationId: simulado.id,
				role: "assistant",
				channel: "whatsapp",
				content: "template a",
				templateName: "template_a",
				createdAt: DENTRO,
			},
			// Fala do cliente com um template_name qualquer não é envio de template.
			{
				conversationId: real.id,
				role: "user",
				channel: "whatsapp",
				content: "oi",
				templateName: "template_a",
				createdAt: DENTRO,
			},
		]);

		const fila = await db
			.insert(schema.whatsappOutboundQueue)
			.values([
				// Fila: 1 enviada do template_a na janela.
				{ to: "5562999990000", usageKey: "template_a", status: "sent", sentAt: DENTRO },
				// Pendente não saiu: NÃO conta.
				{ to: "5562999990001", usageKey: "template_a", status: "pending" },
				// Enviada fora da janela: NÃO conta.
				{ to: "5562999990002", usageKey: "template_a", status: "sent", sentAt: FORA },
			])
			.returning({ id: schema.whatsappOutboundQueue.id });
		queueIds.push(...fila.map((linha) => linha.id));

		const contagens = await custo.contagensDoPeriodo(JANELA_DE, JANELA_ATE);

		expect(contagens).toEqual([
			{ template: "template_a", quantidade: 3 },
			{ template: "template_b", quantidade: 1 },
		]);
	});

	it("sem preço cadastrado, a contagem aparece e o custo é 'sem_preco'", async () => {
		const resultado = await custo.computeCustoDeMensagem(
			{ de: JANELA_DE, ate: JANELA_ATE },
			{
				lerContagens: async () => [{ template: "template_a", quantidade: 4 }],
				lerPreco: async () => null,
			},
		);

		expect(resultado.quantidade).toBe(4);
		expect(resultado.custo).toMatchObject({ tipo: "motivo", motivo: "sem_preco" });
	});
});
