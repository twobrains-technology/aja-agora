// POST /api/chat/reset — comando oculto /reset do chat web (D17).
//
// Reset do AGENTE na web (decisão do Kairo, 2026-06-11): paridade com o
// /reset do WhatsApp (processor.ts) + as camadas que só existem no web.
// "Se o dado foi para o funil, pode deletar tbm" — delete com cascade.
//
// O que faz, em ordem:
//   1. loadIdentity ANTES do delete (o identityEnc vive na metadata da
//      conversa — depois do delete o phone seria irrecuperável).
//   2. Purga a memória Letta best-effort: identity anon-cookie do aja_uid
//      atual + identity phone do celular da conversa. Falha = loga e segue.
//   3. Deleta a conversa (cascade: messages→artifacts, leads→events/insights,
//      beviProposals, evaluations; memoryEvents→SET NULL preserva auditoria).
//   4. Regenera o cookie aja_uid — desvincula o device de qualquer resto.
//
// Sem auth (mesmo modelo do /reset WhatsApp e do chat público): o dano
// possível é deletar o PRÓPRIO estado — conversationId é UUID v4
// impraticável de forjar. Rate limit igual ao /api/chat.

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { loadIdentity } from "@/lib/conversation/identity";
import { getMemoryAdapter } from "@/lib/memory";
import {
	COOKIE_MAX_AGE_SECONDS,
	COOKIE_NAME,
	generateCookieValue,
	identityFromCookie,
	identityFromPhone,
	normalizePhoneBR,
} from "@/lib/memory/identity";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

const bodySchema = z.object({
	conversationId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		"unknown";
	const rate = checkRateLimit(ip);
	if (!rate.allowed) {
		return new Response("Too many requests.", {
			status: 429,
			headers: { "Retry-After": String(Math.ceil((rate.retryAfterMs ?? 60000) / 1000)) },
		});
	}

	// Body inválido/não-UUID → reset parcial (cookie + memória do device),
	// nunca 500: o comando precisa funcionar até com estado local corrompido.
	let conversationId: string | null = null;
	try {
		const parsed = bodySchema.safeParse(await req.json());
		conversationId = parsed.success ? (parsed.data.conversationId ?? null) : null;
	} catch {
		conversationId = null;
	}

	const oldCookie = req.cookies.get(COOKIE_NAME)?.value ?? null;
	const adapter = getMemoryAdapter();
	let memoryPurged = false;

	// 1. Identity da conversa ANTES do delete (vive na metadata cifrada)
	let phoneE164: string | null = null;
	if (conversationId) {
		try {
			const identity = await loadIdentity(conversationId);
			phoneE164 = identity ? normalizePhoneBR(identity.celular) : null;
		} catch {
			// metadata corrompida / chave ausente → segue sem purge de phone
		}
	}

	// 2. Purge best-effort das memórias (nunca bloqueia o reset)
	if (oldCookie) {
		try {
			await adapter.purgeIdentity(identityFromCookie(oldCookie));
			memoryPurged = true;
		} catch {
			// best-effort
		}
	}
	if (phoneE164) {
		try {
			await adapter.purgeIdentity(identityFromPhone(phoneE164));
			memoryPurged = true;
		} catch {
			// best-effort
		}
	}

	// 3. Delete com cascade (mesmo modelo do /reset WhatsApp)
	if (conversationId) {
		await db.delete(conversations).where(eq(conversations.id, conversationId));
	}

	// 4. Cookie novo — desvincula o device. Sem PII no log.
	const newCookie = generateCookieValue();
	console.log(
		`[chat-reset] conversation=${conversationId ?? "none"} memoryPurged=${memoryPurged}`,
	);

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Set-Cookie": `${COOKIE_NAME}=${newCookie}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax; HttpOnly`,
		},
	});
}
