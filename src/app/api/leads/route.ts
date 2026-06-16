import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { conversations, leads, messages as messagesTable } from "@/db/schema";
import { createLeadFromConversation } from "@/lib/admin/lead-stage-tracker";
import { relinkOrphanProposals } from "@/lib/bevi/proposal-repo";
import { maskPhoneForDisplay } from "@/lib/conversation/identity";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { leadSchema } from "@/lib/lead/schema";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { handoffToAgents } from "@/lib/whatsapp/proxy";

export async function POST(req: NextRequest) {
	// ---- Rate limiting ----
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		"unknown";

	const rateLimitResult = checkRateLimit(ip);
	if (!rateLimitResult.allowed) {
		return new Response("Too many requests. Please wait a moment.", {
			status: 429,
			headers: {
				"Retry-After": String(Math.ceil((rateLimitResult.retryAfterMs ?? 60000) / 1000)),
			},
		});
	}

	// ---- Parse + validate ----
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
	}

	const { conversationId, ...formFields } = body as Record<string, unknown>;

	// Validate conversationId
	if (!conversationId || typeof conversationId !== "string") {
		return Response.json({ ok: false, error: "conversationId is required" }, { status: 400 });
	}

	// Validate form fields with shared Zod schema
	const parsed = leadSchema.safeParse(formFields);
	if (!parsed.success) {
		return Response.json(
			{ ok: false, error: "Validation failed", details: parsed.error.issues },
			{ status: 400 },
		);
	}

	// ---- Verify conversation exists ----
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId as string),
	});

	if (!conv) {
		return Response.json({ ok: false, error: "Conversation not found" }, { status: 404 });
	}

	// ---- Insert or update lead (idempotente — PII só aqui, nunca em messages/artifacts) ----
	try {
		const existing = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId as string),
		});

		let leadId: string;
		if (existing) {
			await db
				.update(leads)
				.set({
					name: parsed.data.name,
					phone: parsed.data.phone,
					email: parsed.data.email ?? null,
					updatedAt: new Date(),
				})
				.where(eq(leads.id, existing.id));
			leadId = existing.id;
		} else {
			// Helper único garante: lead herda is_simulated da conversation, e
			// applyTrackedStageToLead (kanban) só roda em conversa real.
			const created = await createLeadFromConversation({
				conversationId: conversationId as string,
				name: parsed.data.name,
				phone: parsed.data.phone,
				email: parsed.data.email ?? null,
			});
			leadId = created.leadId;
		}

		// FIX-48: resgate retroativo — se a proposta foi criada ANTES do lead
		// (corrida web: o fechamento gera a proposta e só depois o form captura
		// nome/telefone), ela ficou órfã (leadId null) e a raia travou. Religa ao
		// lead recém-resolvido e dispara a transição `proposta_enviada`. Idempotente.
		try {
			await relinkOrphanProposals(conversationId as string, leadId);
		} catch (err) {
			console.error("[leads] relinkOrphanProposals error:", err);
		}

		// FIX-27: telefone do lead capturado → marca no meta (MASCARADO, LGPD) pra
		// o opt-in de WhatsApp virar CONFIRMAÇÃO de canal em vez de re-coletar o
		// número que o usuário já informou aqui.
		const maskedPhone = maskPhoneForDisplay(parsed.data.phone);
		if (maskedPhone) {
			await persistMeta(conversationId as string, { ...metaOf(conv), contactPhone: maskedPhone });
		}

		// Trigger handoff to vendor(s) via WhatsApp (non-blocking)
		if (conv.channel === "web" && conv.status === "active") {
			const recentMsgs = await db.query.messages.findMany({
				where: eq(messagesTable.conversationId, conversationId as string),
				orderBy: (m, { desc }) => [desc(m.createdAt)],
				limit: 6,
			});
			const summary = recentMsgs
				.reverse()
				.map((m) => `${m.role === "user" ? "👤" : "🤖"} ${m.content.slice(0, 200)}`)
				.join("\n");

			try {
				const emailLine = parsed.data.email ? `\n📧 ${parsed.data.email}` : "";
				await handoffToAgents(
					conversationId as string,
					"", // no waId for web users
					parsed.data.name,
					`📱 *Lead via Web*${emailLine}\n📞 ${parsed.data.phone}\n\n${summary}`,
				);
			} catch (err) {
				console.error("[leads] Handoff error:", err);
			}
		}

		return Response.json({ ok: true, leadId });
	} catch (err) {
		console.error("Failed to insert lead:", err);
		return Response.json({ ok: false, error: "Failed to save lead data" }, { status: 500 });
	}
}
