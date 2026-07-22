// Camada 1 — /reset web (D17): rota POST /api/chat/reset.
// Reset do AGENTE na web (decisão do Kairo 2026-06-11): apaga tudo como no
// WhatsApp — conversa com cascade (messages/artifacts/leads/propostas vão
// junto, "se o dado foi para o funil, pode deletar tbm"), purga a memória
// Letta (anon-cookie do device + phone da conversa) e regenera o aja_uid.
// Test plan: docs/test-plans/reset-web.md (P0-1, P0-2, P0-4, EC-*).

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads, messages } from "@/db/schema";

// IDENTITY_ENC_KEY precisa existir ANTES de importar storeIdentity
process.env.IDENTITY_ENC_KEY ??= randomBytes(32).toString("base64");

const purgeIdentityMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/memory", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/lib/memory")>();
	return {
		...original,
		getMemoryAdapter: () => ({
			purgeIdentity: purgeIdentityMock,
			isPersistent: () => true,
		}),
	};
});

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

import { storeIdentity } from "@/lib/conversation/identity";
import { COOKIE_NAME } from "@/lib/memory/identity";
import { POST } from "./route";

// CPF fake com DV válido (módulo 11) — NUNCA CPF real em fixture (test plan §8)
const FAKE_CPF = "52998224725";
const FAKE_CELULAR = "62999990000";

const OLD_COOKIE = "a1b2c3d4e5f60718a1b2c3d4e5f60718";

function makeReq(body: unknown, cookie: string | null = OLD_COOKIE): NextRequest {
	const req = new Request("http://localhost/api/chat/reset", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	}) as unknown as NextRequest;
	// Mesmo padrão dos demais route tests — só o get() é usado pela rota.
	(req as { cookies: unknown }).cookies = {
		get: (name: string) => (cookie && name === COOKIE_NAME ? { name, value: cookie } : undefined),
	} as unknown as NextRequest["cookies"];
	return req;
}

let convId: string;

beforeEach(async () => {
	purgeIdentityMock.mockClear();
	const [c] = await db.insert(conversations).values({ contactName: "Teste" }).returning();
	convId = c.id;
});

afterEach(async () => {
	// Cleanup defensivo — o próprio teste deleta no happy path
	await db.delete(conversations).where(eq(conversations.id, convId));
});

describe("D17 — POST /api/chat/reset (P0-1: happy path no meio do funil)", () => {
	it("deleta a conversa com cascade, troca o cookie e purga as memórias", async () => {
		// Seed: mensagens + lead + identity cifrada (funil em andamento)
		await db.insert(messages).values([
			{ conversationId: convId, role: "user", content: "quero um carro" },
			{ conversationId: convId, role: "assistant", content: "boa!" },
		]);
		await db.insert(leads).values({ conversationId: convId, name: "Teste" });
		await storeIdentity(convId, { cpf: FAKE_CPF, celular: FAKE_CELULAR });

		const res = await POST(makeReq({ conversationId: convId }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });

		// Cascade: conversa, mensagens e lead sumiram
		expect(
			await db.query.conversations.findFirst({ where: eq(conversations.id, convId) }),
		).toBeUndefined();
		expect(
			await db.query.messages.findFirst({ where: eq(messages.conversationId, convId) }),
		).toBeUndefined();
		expect(
			await db.query.leads.findFirst({ where: eq(leads.conversationId, convId) }),
		).toBeUndefined();

		// Cookie novo: 32 hex, diferente do antigo, HttpOnly, 90d
		const setCookie = res.headers.get("Set-Cookie") ?? "";
		const m = new RegExp(`${COOKIE_NAME}=([a-f0-9]{32})`).exec(setCookie);
		expect(m).not.toBeNull();
		expect(m?.[1]).not.toBe(OLD_COOKIE);
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("Max-Age=7776000");
		expect(setCookie).toContain("SameSite=Lax");

		// P0-2: purge das DUAS identidades — anon-cookie do device + phone da conversa
		const purged = purgeIdentityMock.mock.calls.map(([identity]) => identity);
		expect(purged).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "anon-cookie", value: OLD_COOKIE }),
				expect.objectContaining({ kind: "phone", value: `+55${FAKE_CELULAR}` }),
			]),
		);
	});

	it("purga a memória phone ANTES de deletar (identity vive na metadata da conversa)", async () => {
		await storeIdentity(convId, { cpf: FAKE_CPF, celular: FAKE_CELULAR });
		await POST(makeReq({ conversationId: convId }));
		// Se o delete viesse antes do loadIdentity, o purge do phone seria impossível
		const phonePurge = purgeIdentityMock.mock.calls.find(([i]) => i.kind === "phone");
		expect(phonePurge).toBeDefined();
	});
});

describe("D17 — edge cases (EC do test plan)", () => {
	it("sem conversationId → 200, reset parcial: cookie novo + purge anon-cookie, nada deletado", async () => {
		const res = await POST(makeReq({}));
		expect(res.status).toBe(200);
		expect(res.headers.get("Set-Cookie")).toContain(`${COOKIE_NAME}=`);
		// conversa de outro usuário intacta
		expect(
			await db.query.conversations.findFirst({ where: eq(conversations.id, convId) }),
		).toBeDefined();
		expect(purgeIdentityMock.mock.calls.map(([i]) => i.kind)).toEqual(["anon-cookie"]);
	});

	it("conversationId não-UUID → 200 sem crash, nada deletado", async () => {
		const res = await POST(makeReq({ conversationId: "lixo'; DROP TABLE--" }));
		expect(res.status).toBe(200);
		expect(
			await db.query.conversations.findFirst({ where: eq(conversations.id, convId) }),
		).toBeDefined();
	});

	it("sem cookie na request → ainda reseta a conversa e seta cookie novo (purge só phone se houver identity)", async () => {
		const res = await POST(makeReq({ conversationId: convId }, null));
		expect(res.status).toBe(200);
		expect(res.headers.get("Set-Cookie")).toMatch(new RegExp(`${COOKIE_NAME}=[a-f0-9]{32}`));
		expect(
			await db.query.conversations.findFirst({ where: eq(conversations.id, convId) }),
		).toBeUndefined();
		// sem cookie e sem identity coletada → nenhum purge
		expect(purgeIdentityMock).not.toHaveBeenCalled();
	});

	it("P0-4: purge que rejeita NÃO derruba o reset (best-effort)", async () => {
		purgeIdentityMock.mockRejectedValueOnce(new Error("letta down"));
		const res = await POST(makeReq({ conversationId: convId }));
		expect(res.status).toBe(200);
		expect(
			await db.query.conversations.findFirst({ where: eq(conversations.id, convId) }),
		).toBeUndefined();
	});

	it("duplo /reset consecutivo → segundo é idempotente (conversa já não existe)", async () => {
		await POST(makeReq({ conversationId: convId }));
		const res2 = await POST(makeReq({ conversationId: convId }));
		expect(res2.status).toBe(200);
		expect(await res2.json()).toEqual({ ok: true });
	});
});
