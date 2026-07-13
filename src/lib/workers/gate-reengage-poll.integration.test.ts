// Integration (DB real) — FIX-207 (watchdog de inatividade do funil). O worker
// varre conversas WhatsApp com um gate do funil pendente há mais que o teto e
// re-abre o funil (dispara o gate). Idempotente: dispara no máximo uma vez por
// pendência (limpa o marcador). Nunca re-engaja handoff/fechado/lead. Skip sem DB.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const { db } = await import("@/db");
const { conversations } = await import("@/db/schema");
const { metaOf } = await import("@/lib/conversation/meta");
const { runReengageCycle } = await import("@/lib/workers/gate-reengage-poll");
const { GATE_REENGAGE_TIMEOUT_MS } = await import("@/lib/agent/gate-reengage");
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
		over: { status?: "active" | "handed_off" | "closed"; waId?: string | null } = {},
	): Promise<string> {
		waCounter += 1;
		const [c] = await db
			.insert(conversations)
			.values({
				waId: over.waId === null ? null : (over.waId ?? `551199900${1000 + waCounter}`),
				channel: "whatsapp",
				status: over.status ?? "active",
				contactName: "Kairo",
				metadata: meta as Record<string, unknown>,
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
});
