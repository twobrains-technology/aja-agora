/**
 * FIX-172 — gate "identify" (web) não normaliza o DDI do celular.
 *
 * Bug real achado via E2E de tela ao vivo (QA autônomo FRENTE 2, 2026-07-01):
 * o usuário confirma CPF+celular no card de identidade digitando o celular
 * COM o DDI ("+55 62 99249-6793" ou "5562992496793") — entrada plausível (é
 * assim que o próprio WhatsApp exibe o número, e é o formato que veio da
 * conta de teste real de homologação). O gate `identify` só tira os
 * não-dígitos (`celularDigits = celular.replace(/\D/g, "")`), NUNCA remove o
 * "55" — o valor cru (13 dígitos) é cifrado e guardado.
 *
 * No Passo 6 "Contratar", `contract-submit` manda esse celular (ainda com o
 * "55") pra API REAL da Bevi, que rejeita: `BeviApiError 400 { field:
 * 'CELULAR', message: 'CELULAR inválido.' }` — reproduzido AO VIVO contra a
 * loja de homologação (`docs/integracoes/contas-teste-homologacao.md`).
 * O usuário nunca fecha a proposta, mesmo tentando de novo (o celular
 * guardado continua errado).
 *
 * O canal WhatsApp já resolve isso corretamente: `waIdToCelular()`
 * (`src/lib/whatsapp/identify-capture.ts:48`) tira o DDI explicitamente
 * ("waId vem com DDI... a Bevi espera DDD+número"). O gate `identify` do web
 * (`route.ts` ~linha 969) é a ÚNICA entrada de identidade que NÃO normaliza —
 * quebra de paridade web×WhatsApp que vira bug de produto.
 *
 * Fix: normalizar com `normalizePhoneBR` (mesma função já usada em
 * `saveContactWhatsapp`/`leads.phone` em todo o resto do app) ANTES de
 * persistir via `storeIdentity`.
 */

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads, messages as messagesTable } from "@/db/schema";
import { loadIdentity } from "@/lib/conversation/identity";

const run = process.env.RUN_DB_TESTS === "1";

if (!process.env.IDENTITY_ENC_KEY) {
	process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
}

const { POST } = await import("./route");

// CPF de teste ALGORITMICAMENTE válido (dummy consagrado, já usado em outros
// testes deste repo — src/lib/conversation/identity.test.ts) — NUNCA PII real.
const DUMMY_CPF = "52998224725";

function makeChatReq(body: unknown): NextRequest {
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	});
}

async function cleanup(convId: string): Promise<void> {
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describe.runIf(run)("FIX-172 — gate identify normaliza DDI do celular (paridade web×WhatsApp)", () => {
	let convId: string;

	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("celular digitado COM DDI (55) é normalizado pra DDD+número antes de cifrar", async () => {
		// Estado pré-identidade: qualificação ainda incompleta (creditMax ausente)
		// → após identify, nextGate() = "credit" (pipeGatePrompt, SEM LLM) — isola
		// o teste na normalização, sem precisar mockar streamText.
		const [conv] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: {
					currentPersona: "auto",
					currentCategory: "auto",
					experiencePrev: "first",
					qualifyConsented: true,
				},
			})
			.returning();
		convId = conv.id;

		const res = await POST(
			makeChatReq({
				conversationId: convId,
				action: {
					kind: "gate",
					gate: "identify",
					value: { cpf: DUMMY_CPF, celular: "5562992496793", lgpd: true },
				},
				messages: [{ role: "user", parts: [{ type: "text", text: "Enviei meus dados" }] }],
			}),
		);
		expect(res.status).toBe(200);
		await res.text(); // drena o stream (execute só roda até o fim quando lido)

		const stored = await loadIdentity(convId);
		expect(stored).not.toBeNull();
		expect(stored?.celular).toBe("62992496793"); // 11 dígitos, SEM o "55"
		expect(stored?.celular.length).toBe(11);
	});

	it("celular digitado JÁ sem DDI (11 dígitos) continua funcionando (regressão)", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: {
					currentPersona: "auto",
					currentCategory: "auto",
					experiencePrev: "first",
					qualifyConsented: true,
				},
			})
			.returning();
		convId = conv.id;

		const res = await POST(
			makeChatReq({
				conversationId: convId,
				action: {
					kind: "gate",
					gate: "identify",
					value: { cpf: DUMMY_CPF, celular: "62992496793", lgpd: true },
				},
				messages: [{ role: "user", parts: [{ type: "text", text: "Enviei meus dados" }] }],
			}),
		);
		expect(res.status).toBe(200);
		await res.text();

		const stored = await loadIdentity(convId);
		expect(stored?.celular).toBe("62992496793");
	});
});
