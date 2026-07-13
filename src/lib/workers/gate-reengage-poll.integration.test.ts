// Integration (DB real) — FIX-207 (watchdog de inatividade do funil). O worker
// varre conversas ATIVAS (WhatsApp + web, FIX-302) com um gate do funil pendente
// há mais que o teto e re-abre o funil. WhatsApp dispara o gate (fireGate).
// Idempotente: dispara no máximo uma vez por pendência (limpa o marcador). Web
// persiste a mensagem de reengajamento na tabela de mensagens (sem sessão SSE
// viva pra empurrar) e reusa a escada FIX-211 (4 tentativas) via re-arme
// controlado do marcador. Nunca re-engaja handoff/fechado/lead. Skip sem DB.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const { db } = await import("@/db");
const { conversations, messages } = await import("@/db/schema");
const { metaOf } = await import("@/lib/conversation/meta");
const { runReengageCycle } = await import("@/lib/workers/gate-reengage-poll");
const { GATE_REENGAGE_TIMEOUT_MS, SPECIALIST_EXIT_OFFER } = await import("@/lib/agent/gate-reengage");
const { getResumableConversation } = await import("@/lib/chat/resume");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

const NOW = new Date("2026-07-02T12:00:00.000Z");
const STALE = NOW.getTime() - GATE_REENGAGE_TIMEOUT_MS - 60_000; // bem além do teto
const FRESH = NOW.getTime() - 5_000; // dentro do teto

let waCounter = 0;

function pendingMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		desireAsked: true,
		currentPersona: "helena-imovel",
		currentCategory: "imovel",
		// FIX-296: sem consent, credit é o 1º gate estrutural pós-desire (re-engajável).
		pendingGateSince: STALE,
		pendingGate: "credit",
		...over,
	};
}

describeIfDb("FIX-207 gate-reengage worker — re-abre o funil parado no WhatsApp", () => {
	const created: string[] = [];
	const fire = vi.fn().mockResolvedValue(undefined);

	beforeEach(() => {
		fire.mockClear();
	});
	afterEach(async () => {
		for (const id of created) await db.delete(conversations).where(eq(conversations.id, id));
		created.length = 0;
	});

	async function seed(
		meta: ConversationMetadata,
		over: {
			status?: "active" | "handed_off" | "closed";
			waId?: string | null;
			channel?: "whatsapp" | "web";
			webCookie?: string;
		} = {},
	): Promise<string> {
		waCounter += 1;
		const channel = over.channel ?? "whatsapp";
		const metadata =
			channel === "web" && over.webCookie
				? ({ ...meta, webCookie: over.webCookie } as Record<string, unknown>)
				: (meta as Record<string, unknown>);
		const [c] = await db
			.insert(conversations)
			.values({
				waId: channel === "whatsapp" ? (over.waId === null ? null : (over.waId ?? `551199900${1000 + waCounter}`)) : null,
				channel,
				status: over.status ?? "active",
				contactName: "Kairo",
				metadata,
			})
			.returning();
		created.push(c.id);
		return c.id;
	}

	it("conversa parada além do teto → dispara o gate UMA vez e limpa o marcador", async () => {
		const id = await seed(pendingMeta());

		const result = await runReengageCycle({ now: NOW, fire });

		expect(result.reengaged).toBeGreaterThanOrEqual(1);
		// Disparou o gate re-calculado (credit) no waId da conversa.
		const call = fire.mock.calls.find((c) => c[1] === id);
		expect(call).toBeTruthy();
		expect(call?.[2]).toBe("credit");

		// Marcador limpo (idempotência: não re-dispara).
		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, id) });
		const meta = metaOf(conv);
		expect(meta.pendingGateSince).toBeUndefined();
		expect(meta.pendingGate).toBeUndefined();
	});

	it("conversa DENTRO do teto (usuário pode estar digitando) → NÃO dispara", async () => {
		const id = await seed(pendingMeta({ pendingGateSince: FRESH }));

		await runReengageCycle({ now: NOW, fire });

		expect(fire.mock.calls.find((c) => c[1] === id)).toBeUndefined();
		// Marcador preservado (ainda dentro da janela).
		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, id) });
		expect(metaOf(conv).pendingGateSince).toBe(FRESH);
	});

	it("handoff humano pendente → NUNCA re-engaja (mesmo além do teto)", async () => {
		const id = await seed(pendingMeta({ handoffSuggested: true }));

		await runReengageCycle({ now: NOW, fire });

		expect(fire.mock.calls.find((c) => c[1] === id)).toBeUndefined();
	});

	it("conversa fechada (status=closed) → não entra na varredura", async () => {
		const id = await seed(pendingMeta(), { status: "closed" });

		await runReengageCycle({ now: NOW, fire });

		expect(fire.mock.calls.find((c) => c[1] === id)).toBeUndefined();
	});

	it("idempotência: segundo ciclo NÃO re-dispara (marcador já limpo no 1º)", async () => {
		const id = await seed(pendingMeta());

		await runReengageCycle({ now: NOW, fire });
		fire.mockClear();
		await runReengageCycle({ now: NOW, fire });

		expect(fire.mock.calls.find((c) => c[1] === id)).toBeUndefined();
	});

	it("sem waId → não dispara nem quebra o ciclo", async () => {
		const id = await seed(pendingMeta(), { waId: null });

		const result = await runReengageCycle({ now: NOW, fire });

		expect(fire.mock.calls.find((c) => c[1] === id)).toBeUndefined();
		expect(typeof result.reengaged).toBe("number");
	});

	it("FIX-302 — WhatsApp não regride: continua via fireGate, NUNCA persiste mensagem na tabela", async () => {
		const id = await seed(pendingMeta());

		await runReengageCycle({ now: NOW, fire });

		expect(fire.mock.calls.find((c) => c[1] === id)).toBeTruthy();
		const rows = await db.query.messages.findMany({ where: eq(messages.conversationId, id) });
		expect(rows.length).toBe(0);
	});
});

describeIfDb("FIX-302 gate-reengage worker — canal WEB (sem sessão SSE viva)", () => {
	const created: string[] = [];
	let webCounter = 0;

	afterEach(async () => {
		for (const id of created) await db.delete(conversations).where(eq(conversations.id, id));
		created.length = 0;
	});

	async function seedWeb(
		meta: ConversationMetadata,
		over: { status?: "active" | "handed_off" | "closed"; webCookie?: string } = {},
	): Promise<{ id: string; cookie: string }> {
		webCounter += 1;
		const cookie = over.webCookie ?? `cookie-web-${webCounter}`;
		const [c] = await db
			.insert(conversations)
			.values({
				waId: null,
				channel: "web",
				status: over.status ?? "active",
				// Nome já capturado (o gate `name` já passou — nextGate() com
				// hasContactName=false força "name", que é NON_REENGAGE; a conversa
				// stuck no `identify` pressupõe o nome já coletado antes).
				contactName: "Kairo",
				metadata: { ...meta, webCookie: cookie } as Record<string, unknown>,
			})
			.returning();
		created.push(c.id);
		// getResumableConversation exige pelo menos 1 mensagem existente pra
		// "achar" a conversa (o turno de usuário que deixou o gate pendente).
		await db.insert(messages).values({ conversationId: c.id, role: "user", content: "oi", channel: "web" });
		return { id: c.id, cookie };
	}

	it("conversa web parada além do teto → persiste mensagem de reengajamento, disponível via /api/chat/resume sem reload", async () => {
		// Este cenário testa especificamente o gate `identify` (copy "CPF e
		// celular") — o default de pendingMeta() é "credit" (1º gate pós-desire,
		// FIX-296), então precisa do override explícito.
		const { id, cookie } = await seedWeb(
			pendingMeta({ pendingGate: "identify", qualifyAnswers: { creditMax: 120_000 } }),
		);

		const result = await runReengageCycle({ now: NOW });

		expect(result.reengaged).toBe(1);

		const resumed = await getResumableConversation(cookie);
		expect(resumed).not.toBeNull();
		const reengageMsg = resumed?.messages.find((m) => m.role === "assistant");
		expect(reengageMsg?.content).toContain("CPF e celular");

		// Escalação (FIX-211): 1ª tentativa RE-ARMA o marcador — continua cobrando
		// até o teto de 4 tentativas.
		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, id) });
		const meta = metaOf(conv);
		expect(meta.pendingGateSince).toBe(NOW.getTime());
		expect(meta.gateAttempts?.identify).toBe(1);
	});

	it("escada completa (4 tentativas) no canal web: pergunta direta → incentivo → reforço → oferta de especialista", async () => {
		// Mesma razão do teste acima: escada testada contra a copy do gate
		// `identify` ("CPF e celular"), default de pendingMeta() é "credit".
		const { id, cookie } = await seedWeb(
			pendingMeta({ pendingGate: "identify", qualifyAnswers: { creditMax: 120_000 } }),
		);

		let now = NOW;
		for (let attempt = 1; attempt <= 4; attempt++) {
			const result = await runReengageCycle({ now });
			expect(result.reengaged).toBe(1);

			const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, id) });
			const meta = metaOf(conv);
			if (attempt < 4) {
				// Re-armou pra continuar cobrando — avança o relógio além do próximo teto.
				expect(meta.pendingGateSince).toBe(now.getTime());
				now = new Date(now.getTime() + GATE_REENGAGE_TIMEOUT_MS + 1_000);
			} else {
				// 4ª tentativa: saída pro especialista — NÃO re-arma (anti-loop-infinito).
				expect(meta.pendingGateSince).toBeUndefined();
			}
		}

		const resumed = await getResumableConversation(cookie);
		const assistantTexts = (resumed?.messages ?? [])
			.filter((m) => m.role === "assistant")
			.map((m) => m.content);
		expect(assistantTexts.length).toBe(4);
		expect(assistantTexts[0]).toContain("CPF e celular"); // pergunta direta
		expect(assistantTexts[1]).toContain("rapidinho"); // incentivo
		expect(assistantTexts[2]).toContain("seguro"); // reforço de segurança
		expect(assistantTexts[3]).toBe(SPECIALIST_EXIT_OFFER); // oferta de especialista

		// Sem marcador re-armado, um novo ciclo (mesmo bem além do teto) não
		// dispara uma 5ª mensagem — anti-armadilha, nunca loop infinito.
		await runReengageCycle({ now: new Date(now.getTime() + GATE_REENGAGE_TIMEOUT_MS + 1_000) });
		const resumedAfter = await getResumableConversation(cookie);
		const assistantTextsAfter = (resumedAfter?.messages ?? []).filter((m) => m.role === "assistant");
		expect(assistantTextsAfter.length).toBe(4);
	});

	it("handoff humano pendente no web → NUNCA re-engaja (mesmo além do teto)", async () => {
		const { id } = await seedWeb(pendingMeta({ handoffSuggested: true }));

		await runReengageCycle({ now: NOW });

		const rows = await db.query.messages.findMany({ where: eq(messages.conversationId, id) });
		expect(rows.filter((m) => m.role === "assistant").length).toBe(0);
	});
});
