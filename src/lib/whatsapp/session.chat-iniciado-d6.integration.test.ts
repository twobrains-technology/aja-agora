// D6 — o `ChatIniciado` do WhatsApp mede a PESSOA, não o produto.
//
// O `wa.me` do botão flutuante e o texto do CTA chegam ao WhatsApp já escritos:
// a pessoa só aperta "enviar". Se o evento de início de conversa nascer de
// qualquer primeira mensagem, ele mede o ANÚNCIO, não a intenção — e ensina o
// algoritmo a buscar quem clica, que é justamente o que o evento existe para
// substituir (`inicio-de-conversa.ts`, item B3).
//
// A regra não é regex sobre fala do cliente: o predicado (`ehMensagemPrePreenchida`)
// compara contra o texto que ESTE repositório gera, importado das constantes
// reais. Aqui o que se prova é a COSTURA: quem abre a conversa passa a fala, e
// a fala pré-preenchida não vira `chat_iniciado`.
//
// Integração com banco real. Skip se DATABASE_URL ausente.

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Números únicos por execução (o Postgres é compartilhado entre os agentes).
// De propósito NÃO usam o prefixo `SIM-`: conversa simulada nunca registra o
// evento, e o teste passaria sem provar nada.
const SUFIXO = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const WA_PREENCHIDA = `5566${SUFIXO}`;
const WA_ESCRITA = `5577${SUFIXO}`;
const WA_SEM_FALA = `5588${SUFIXO}`;

describeIfDb("D6 — primeira mensagem pré-preenchida não vira ChatIniciado", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let getOrCreateConversation: typeof import("./session").getOrCreateConversation;

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ getOrCreateConversation } = await import("./session"));
		await cleanup();
	});

	afterAll(async () => {
		await cleanup();
	});

	async function cleanup() {
		if (!convIds.length) return;
		await db
			.delete(schema.conversionEvents)
			.where(inArray(schema.conversionEvents.conversationId, convIds));
		await db.delete(schema.leads).where(inArray(schema.leads.conversationId, convIds));
		await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		convIds.length = 0;
	}

	async function nasceuOEvento(convId: string) {
		const linhas = await db
			.select({ nome: schema.conversionEvents.eventName })
			.from(schema.conversionEvents)
			.where(
				and(
					eq(schema.conversionEvents.conversationId, convId),
					eq(schema.conversionEvents.eventName, "chat_iniciado"),
				),
			);
		return linhas.length > 0;
	}

	it("título de botão ('Carro') abre a conversa sem registrar o evento", async () => {
		const { id, isNew } = await getOrCreateConversation(WA_PREENCHIDA, undefined, "Carro");
		convIds.push(id);

		expect(isNew).toBe(true);
		expect(await nasceuOEvento(id)).toBe(false);
	});

	it("fala escrita pela pessoa registra o evento, como sempre registrou", async () => {
		const { id, isNew } = await getOrCreateConversation(
			WA_ESCRITA,
			undefined,
			"Oi, quero entender como funciona o consórcio de carro",
		);
		convIds.push(id);

		expect(isNew).toBe(true);
		expect(await nasceuOEvento(id)).toBe(true);
	});

	it("sem a fala em mãos (undefined) o evento sai como sempre saiu", async () => {
		// Caminhos que não têm a mensagem em mãos (o carimbo de origem do site, por
		// exemplo) continuam medindo: ausência de dado não vira silêncio.
		const { id, isNew } = await getOrCreateConversation(WA_SEM_FALA);
		convIds.push(id);

		expect(isNew).toBe(true);
		expect(await nasceuOEvento(id)).toBe(true);
	});
});
