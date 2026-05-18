/**
 * Bug A: "Tenho interesse" → form aparece com Nome VAZIO mesmo quando
 * o agente já capturou o nome durante a conversa
 * (conversations.contactName = "Monique").
 *
 * Bug B: O agente NÃO oferece o WhatsApp proativamente DURANTE a
 * conversa com narrativa estratégica ("pra não perder seu atendimento
 * caso aconteça alguma instabilidade de internet, me compartilha seu
 * WhatsApp"). Hoje só pede WhatsApp depois da 1a simulacao via card
 * genérico (sem narrativa estratégica).
 *
 * Integration test:
 *  - Cenário A bate no POST /api/chat real, com DB real, action
 *    `interest` (mesmo path do botão "Tenho interesse"). Drena o
 *    SSE stream do `createUIMessageStream` e parseia os data parts
 *    pra achar o artifact `lead_form`. Assert que o payload carrega
 *    o nome pré-capturado (campo `prefilledName` no contrato —
 *    hoje inexistente).
 *
 *  - Cenário B inspeciona o **contrato configuracional** do agente:
 *    o system_prompt e os examples seedados (mig 0016) precisam
 *    instruir o agente a oferecer o WhatsApp proativamente com a
 *    narrativa estratégica. Como o modelo é não-determinístico, o
 *    teste do contrato é o que captura a regressão de forma estável.
 */

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads, personas } from "@/db/schema";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { POST } from "./route";

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

function makeReq(body: unknown): NextRequest {
	const req = new Request("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": "127.0.0.1",
		},
		body: JSON.stringify(body),
	}) as unknown as NextRequest & {
		cookies: { get: (name: string) => { value: string } | undefined };
	};
	req.cookies = { get: () => undefined };
	return req;
}

async function cleanup(convId: string): Promise<void> {
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

/**
 * O createUIMessageStream emite SSE no formato:
 *   data: { "type": "data-artifact", "id": "...", "data": { ... } }
 *
 * Drena o stream e extrai todos os data-artifact com type=lead_form.
 */
async function extractLeadFormPayload(
	res: Response,
): Promise<Record<string, unknown> | null> {
	const text = await res.text();
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (!line.startsWith("data:")) continue;
		const jsonStr = line.slice("data:".length).trim();
		if (!jsonStr || jsonStr === "[DONE]") continue;
		let parsed: { type?: string; data?: { type?: string; payload?: unknown } };
		try {
			parsed = JSON.parse(jsonStr);
		} catch {
			continue;
		}
		if (
			parsed?.type === "data-artifact" &&
			parsed?.data?.type === "lead_form"
		) {
			return (parsed.data.payload ?? {}) as Record<string, unknown>;
		}
	}
	return null;
}

describe("Bug A — POST /api/chat action=interest deve pré-preencher nome no lead_form", () => {
	let convId: string;

	beforeEach(async () => {
		// Setup: usuário disse "Monique" durante a conversa e o agente já
		// chamou save_contact_name, populando conversations.contactName.
		// Esse é o cenário visto na screenshot.
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Monique" })
			.returning();
		convId = c.id;
	});

	afterEach(async () => {
		await cleanup(convId);
	});

	it("payload do lead_form (artifact) carrega o nome já capturado da conversation (contactName)", async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				action: { kind: "interest", administradora: "Rodobens", label: "Tenho interesse" },
			}),
		);
		expect(res.status).toBe(200);

		const payload = await extractLeadFormPayload(res);
		expect(payload).not.toBeNull();

		// Contrato anti-regressão: o backend DEVE injetar o nome pré-capturado
		// no payload do artifact. Hoje o handler só emite { conversationId },
		// deixando o frontend depender de um GET /api/leads/[id] tardio — quando
		// esse fetch falha ou roda fora de hora, o form aparece vazio (bug).
		//
		// O fix barato é o handler ler conversations.contactName e injetar
		// `prefilledName` (ou shape similar) no payload — eliminando a
		// dependência de fetch ad-hoc no client.
		expect(payload).toMatchObject({ prefilledName: "Monique" });
	});
});

describe("Bug B — system prompt OU examples devem instruir captura proativa de WhatsApp com narrativa estratégica", () => {
	/**
	 * Hoje o system-prompt diz apenas:
	 *   "Apos apresentar present_simulation_result OU present_recommendation_card
	 *    pela 1a vez na conversa, chame present_whatsapp_optin (sem parametros)."
	 *
	 * Falta a narrativa estratégica de "segurança / instabilidade de internet /
	 * não perder o atendimento", que é o que faz o usuário aceitar
	 * compartilhar o WhatsApp ao invés de fechar a aba.
	 *
	 * O teste afirma o CONTRATO CONFIGURACIONAL — basta um dos dois (prompt OU
	 * exemplos seedados) trazer a narrativa pra considerar a regressão coberta.
	 */

	// Token-test: pelo menos UM gatilho semântico que vincule a oferta do
	// WhatsApp a "segurança / continuidade / não perder o atendimento".
	const STRATEGIC_NARRATIVE_PATTERNS: RegExp[] = [
		/instabilidade/i,
		/cair (a )?(conex|internet)/i,
		/perder (o )?atendimento/i,
		/continuar (o |seu )?atendimento (no |pelo |por )?(whats|wa)/i,
		/(se|caso) (a )?(conex|internet) cai/i,
		/se algo acontecer (com |na )?(sua |a )?(internet|conex)/i,
	];

	function containsStrategicNarrative(text: string): boolean {
		return STRATEGIC_NARRATIVE_PATTERNS.some((rx) => rx.test(text));
	}

	function hasWhatsappMention(text: string): boolean {
		return /whats(app)?/i.test(text);
	}

	it("o system_prompt menciona narrativa estratégica ao oferecer o WhatsApp (anti-regressão)", () => {
		// SYSTEM_PROMPT é o concierge/global; SPECIALIST_BASE_PROMPT é o usado
		// pelas specialists (Helena, Rafael, Bruno, Camila). Ambos contam.
		const combined = `${SYSTEM_PROMPT}\n\n${SPECIALIST_BASE_PROMPT}`;
		expect(hasWhatsappMention(combined)).toBe(true);
		expect(
			containsStrategicNarrative(combined),
			`Nenhum padrão de narrativa estratégica (instabilidade / não perder atendimento / continuar por lá) encontrado no system prompt das specialists. O agente vai pedir WhatsApp de forma seca, sem motivar — taxa de aceite baixa.`,
		).toBe(true);
	});

	it("pelo menos 1 example seedado (mig 0016) ou no DB cobre oferta proativa de WhatsApp com narrativa estratégica", async () => {
		// Persona-by-persona: basta UMA das specialists ter o example pra a
		// regressão estar coberta. Idealmente todas teriam, mas evitamos
		// over-fitting do teste.
		const rows = await db.query.personas.findMany({
			where: eq(personas.role, "specialist"),
		});
		expect(rows.length).toBeGreaterThan(0);

		const matches = rows.flatMap((row) =>
			(row.examples ?? []).filter((ex) => {
				const text = `${ex.context ?? ""}\n${ex.userMessage}\n${ex.assistantResponse}`;
				return hasWhatsappMention(text) && containsStrategicNarrative(text);
			}),
		);

		expect(
			matches.length,
			`Nenhum example em nenhuma persona specialist cobre a oferta proativa de WhatsApp com narrativa estratégica (segurança/instabilidade/continuar por lá). Sem esse anchor de few-shot, o agente vai cair no fluxo seco de present_whatsapp_optin sem motivar — usuário recusa.`,
		).toBeGreaterThan(0);
	});
});
