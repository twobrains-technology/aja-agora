/**
 * POST /api/track com eventos de CHAT — o caminho inteiro até o Postgres.
 *
 * O que este arquivo protege é justamente o que teste unitário não alcança: os
 * seis tipos novos são valores de um ENUM do Postgres, e a conversa é uma FK.
 * Um contrato que passa verde em memória ainda quebra no INSERT se o enum não
 * tiver o valor (`invalid input value for enum`) ou se a coluna não existir —
 * e o `recordPageEvents` engole a exceção por design, então a falha apareceria
 * como silêncio: nenhum evento gravado, nenhum erro, nenhum aviso.
 *
 * Skip se DATABASE_URL ausente.
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("POST /api/track — eventos de chat (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let POST: typeof import("./route").POST;
	let eq: typeof import("drizzle-orm").eq;

	let conversationId: string;
	/**
	 * Início da janela do arquivo — a âncora da limpeza.
	 *
	 * Apagar só o que tem `conversation_id` deixaria para trás justamente os
	 * eventos que este teste existe para provar: `chat_open` e `chat_typing` de
	 * quem ainda não tinha conversa nascem com a coluna NULA. Foi o que aconteceu
	 * na primeira versão — três linhas órfãs no banco do workspace.
	 */
	let inicio: Date;

	beforeAll(async () => {
		inicio = new Date();
		db = (await import("@/db")).db;
		schema = await import("@/db/schema");
		POST = (await import("./route")).POST;
		eq = (await import("drizzle-orm")).eq;

		const [conversa] = await db
			.insert(schema.conversations)
			.values({ channel: "web", isSimulated: true })
			.returning({ id: schema.conversations.id });
		conversationId = conversa.id;
	});

	afterAll(async () => {
		if (!conversationId) return;
		const { and, gte, inArray } = await import("drizzle-orm");
		const { TIPOS_EVENTO, ehEventoDeChat } = await import("@/lib/heatmap/events");
		// Lista explícita e não `like 'chat_%'`: a coluna é um ENUM do Postgres, e
		// `~~` não existe para ele sem cast.
		const tiposDeChat = TIPOS_EVENTO.filter(ehEventoDeChat);

		// Tudo que nasceu dentro da janela deste arquivo, com conversa ou sem. A
		// FK é `set null` de propósito, então derrubar a conversa NÃO levaria os
		// eventos junto.
		await db
			.delete(schema.pageEvents)
			.where(
				and(gte(schema.pageEvents.createdAt, inicio), inArray(schema.pageEvents.type, tiposDeChat)),
			);
		await db.delete(schema.conversations).where(eq(schema.conversations.id, conversationId));
	});

	/**
	 * `NextRequest` e não `Request`: a rota lê `req.cookies` pra achar a visita,
	 * e o `Request` do runtime não tem esse acessor — o teste morreria em
	 * `undefined.get` antes de tocar o banco, que é o que ele veio provar.
	 */
	function post(events: unknown[]) {
		return POST(
			new NextRequest("http://test/api/track", {
				method: "POST",
				headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (iPhone)" },
				body: JSON.stringify({ events }),
			}),
		);
	}

	it("grava a sessão inteira do chat, do palco vazio ao fechamento", async () => {
		const base = { path: "/", viewportWidth: 390, viewportHeight: 844, at: Date.now() };

		const resposta = await post([
			{ ...base, type: "chat_open", section: "kv-footer", label: "vazia" },
			{ ...base, type: "chat_typing", duracaoMs: 8_400 },
			{ ...base, type: "chat_send", duracaoMs: 12_000, conversationId },
			{ ...base, type: "chat_receive", duracaoMs: 3_100, conversationId },
			{
				...base,
				type: "chat_card_click",
				selector: "@data-heat-id=card-simular",
				label: "Simular ITAÚ, parcela R$ 5.698,40 por mês",
				conversationId,
			},
			{ ...base, type: "chat_close", label: "scrim", duracaoMs: 61_000, conversationId },
		]);

		expect(resposta.status).toBe(204);

		const gravados = await db
			.select()
			.from(schema.pageEvents)
			.where(eq(schema.pageEvents.conversationId, conversationId));
		// Quatro dos seis carregam a conversa; `chat_open` e `chat_typing` são de
		// ANTES dela existir — e é essa faixa que a instrumentação existe pra ver.
		expect(gravados).toHaveLength(4);

		const porTipo = new Map(gravados.map((e) => [e.type, e]));
		expect(porTipo.get("chat_receive")?.duracaoMs).toBe(3_100);
		expect(porTipo.get("chat_close")?.label).toBe("scrim");
		expect(porTipo.get("chat_card_click")?.selector).toBe("@data-heat-id=card-simular");
		// Sem coordenada: o teatro é `fixed` e o ponto não pertence à página.
		expect(porTipo.get("chat_card_click")?.pageRelX).toBeNull();
	});

	it("grava a abertura de quem NUNCA escreveu — a pessoa que o funil não enxerga", async () => {
		// Este é o caso que motivou os eventos: abriu pelo CTA, olhou o palco
		// vazio, fechou. Nenhuma conversa, nenhuma mensagem, nenhum lead — e até
		// aqui, nenhum registro em lugar nenhum do sistema.
		const at = Date.now();
		const base = { path: "/", viewportWidth: 390, viewportHeight: 844, at };
		const marca = `desistiu-${at}`;

		await post([
			{ ...base, type: "chat_open", section: "kv-hero", label: marca },
			{ ...base, type: "chat_close", label: "x", duracaoMs: 4_000 },
		]);

		const abertura = await db
			.select()
			.from(schema.pageEvents)
			.where(eq(schema.pageEvents.label, marca));
		expect(abertura).toHaveLength(1);
		expect(abertura[0]).toMatchObject({
			type: "chat_open",
			section: "kv-hero",
			conversationId: null,
			device: "mobile",
		});
	});
});
