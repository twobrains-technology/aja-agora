// D8 (FIX-437) — o watchdog NÃO cobra gate de coleta com o desbloqueio do
// telefone pendente.
//
// Reproduz `576e5b66` (30/09 12:16–12:22): o cliente web parou no CARD DO
// TELEFONE, e o `gate-reengage` passou a repetir "valor do bem" — três vezes,
// com a escada fixa — porque `pendingGateAfterTurn` não conhecia o desbloqueio.
//
// Aqui o teste é da FIAÇÃO do worker, que RECONFERE o estado no disparo (não só
// na marcação): a conversa web com o card pendente tem o marcador CONSUMIDO e
// nenhuma mensagem do assistente é inserida. O controle prova que o cinto não é
// cego: com o telefone já conhecido (lead), a cobrança sai como sempre.
//
// Integração com o banco real do workspace. Skip sem DB.

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const { db } = await import("@/db");
const { conversations, leads, messages } = await import("@/db/schema");
const { metaOf } = await import("@/lib/conversation/meta");
const { runReengageCycle } = await import("@/lib/workers/gate-reengage-poll");
const { GATE_REENGAGE_TIMEOUT_MS } = await import("@/lib/agent/gate-reengage");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

const NOW = new Date("2026-10-02T15:00:00.000Z");
const STALE = NOW.getTime() - GATE_REENGAGE_TIMEOUT_MS - 60_000; // bem além do teto

let contador = 0;

/** Conversa web no gate `credit` vencido, parada no card do telefone. O braço A
 *  é gravado como fato no metadata (só o estado pede-antes/borrado importa aqui:
 *  os dois retêm a comparação e ambos são "desbloqueio pendente"). */
function metaParadaNoTelefone(): ConversationMetadata {
	return {
		desireAsked: true,
		currentPersona: "helena-imovel",
		currentCategory: "imovel",
		pendingGateSince: STALE,
		pendingGate: "credit",
		telefoneDoDesbloqueio: { variante: "A" },
	} as ConversationMetadata;
}

describeIfDb("D8 gate-reengage — web parada no card do telefone não cobra gate de coleta", () => {
	const created: string[] = [];

	afterEach(async () => {
		for (const id of created) await db.delete(conversations).where(eq(conversations.id, id));
		created.length = 0;
	});

	async function seedWeb(opts: { comTelefone: boolean }): Promise<string> {
		contador += 1;
		const [c] = await db
			.insert(conversations)
			.values({
				waId: null,
				channel: "web",
				status: "active",
				contactName: "Kairo",
				metadata: metaParadaNoTelefone() as Record<string, unknown>,
			})
			.returning();
		created.push(c.id);
		// O turno de usuário que deixou o gate pendente (também é o que faz o
		// `/api/chat/resume` "achar" a conversa, se algum caso precisar).
		await db
			.insert(messages)
			.values({ conversationId: c.id, role: "user", content: "oi", channel: "web" });
		if (opts.comTelefone) {
			// PII falsa: o lead com telefone torna o desbloqueio `livre` (a régua
			// de "telefone conhecido" do próprio teste A/B).
			await db.insert(leads).values({ conversationId: c.id, phone: `551199900${1000 + contador}` });
		}
		return c.id;
	}

	it("card do telefone pendente → consome o marcador e NÃO insere mensagem", async () => {
		const id = await seedWeb({ comTelefone: false });

		const result = await runReengageCycle({ now: NOW });

		expect(result.reengaged).toBe(0);
		const rows = await db.query.messages.findMany({ where: eq(messages.conversationId, id) });
		expect(rows.filter((m) => m.role === "assistant").length).toBe(0);

		// Marcador CONSUMIDO (não fica re-armado cobrando no ciclo seguinte).
		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, id) });
		const meta = metaOf(conv);
		expect(meta.pendingGateSince).toBeUndefined();
		expect(meta.pendingGate).toBeUndefined();
	});

	it("controle: com o telefone já conhecido, cobra como sempre", async () => {
		const id = await seedWeb({ comTelefone: true });

		const result = await runReengageCycle({ now: NOW });

		expect(result.reengaged).toBe(1);
		const rows = await db.query.messages.findMany({ where: eq(messages.conversationId, id) });
		const doAssistente = rows.filter((m) => m.role === "assistant");
		expect(doAssistente.length).toBe(1);
		// Escada FIX-211: a 1ª cobrança re-arma até o teto.
		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, id) });
		expect(metaOf(conv).gateAttempts?.credit).toBe(1);
	});
});

describeIfDb("D8 gate-reengage — o WhatsApp (sem card de telefone) não regride", () => {
	const created: string[] = [];
	const fire = vi.fn().mockResolvedValue(undefined);

	afterEach(async () => {
		fire.mockClear();
		for (const id of created) await db.delete(conversations).where(eq(conversations.id, id));
		created.length = 0;
	});

	it("whatsapp parado no `credit` segue disparando o gate", async () => {
		contador += 1;
		const [c] = await db
			.insert(conversations)
			.values({
				waId: `551199900${1000 + contador}`,
				channel: "whatsapp",
				status: "active",
				contactName: "Kairo",
				metadata: metaParadaNoTelefone() as Record<string, unknown>,
			})
			.returning();
		created.push(c.id);

		await runReengageCycle({ now: NOW, fire });

		expect(fire.mock.calls.find((call) => call[1] === c.id)).toBeTruthy();
	});
});
