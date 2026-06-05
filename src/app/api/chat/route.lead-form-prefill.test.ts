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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads, personas } from "@/db/schema";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT, whatsappOptinSection } from "@/lib/agent/system-prompt";
import { POST } from "./route";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

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
async function extractLeadFormPayload(res: Response): Promise<Record<string, unknown> | null> {
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
		if (parsed?.type === "data-artifact" && parsed?.data?.type === "lead_form") {
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
		const [c] = await db.insert(conversations).values({ contactName: "Monique" }).returning();
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

/**
 * Camada 1 (structural source-grep) — BUG-LEAD-FORM-PREFILL-REGRESSION
 *
 * Tracker do fix b7fc39e em 3 sites. Cada um pode regredir silenciosamente
 * via merge / refactor / "limpeza" sem o cenário integration acima pegar a
 * regressão a tempo (caso o handler de `action.kind === "interest"` mude
 * de arquivo ou alguém remova o campo do tipo / do bind do form).
 *
 * Esses asserts servem de sentinela de SOURCE — falham na hora se uma das
 * 3 peças for removida do código. Mais barato e mais estável do que
 * snapshot de UI ou eval LLM.
 */
describe("BUG-LEAD-FORM-PREFILL-REGRESSION — source-level guards das 3 peças do fix b7fc39e", () => {
	it("src/lib/chat/types.ts declara `prefilledName?: string | null` em LeadFormPayload", () => {
		const types = readSource("src/lib/chat/types.ts");
		// O contrato de tipo é o primeiro elo: sem o campo, route.ts não
		// compila ao passar e lead-form.tsx perde acesso typed ao valor.
		// Match tolerante a aspas/posição do `?`.
		const declara =
			/interface\s+LeadFormPayload[\s\S]{0,400}prefilledName\??\s*:\s*string\s*\|\s*null/;
		expect(
			declara.test(types),
			"src/lib/chat/types.ts precisa declarar `prefilledName?: string | null` " +
				"dentro de LeadFormPayload. Sem o campo no tipo, qualquer um dos outros " +
				"dois sites perde tipagem e o fix b7fc39e regride silenciosamente.",
		).toBe(true);
	});

	it("src/app/api/chat/route.ts injeta `prefilledName: contactName ?? null` no payload do data-artifact lead_form", () => {
		const route = readSource("src/app/api/chat/route.ts");
		// Match exato do call-site emitindo o artifact com prefilledName.
		// Tolera variações de espaços/quebras mas exige:
		//   - type: "lead_form" próximo (mesmo bloco do data-artifact)
		//   - payload contém prefilledName lendo de contactName
		const injecaoLiteral =
			/type:\s*["']lead_form["'][\s\S]{0,200}payload:\s*\{[^}]*prefilledName:\s*contactName\s*\?\?\s*null/;
		expect(
			injecaoLiteral.test(route),
			"src/app/api/chat/route.ts (action handler `interest`) precisa emitir " +
				"`payload: { conversationId, prefilledName: contactName ?? null }` no " +
				"data-artifact type=lead_form. Sem essa linha o nome já capturado pela " +
				"conversation NUNCA chega ao frontend e o form aparece vazio (bug b7fc39e).",
		).toBe(true);
	});

	it("src/components/chat/artifacts/lead-form.tsx prioriza payload.prefilledName em defaultValues", () => {
		const form = readSource("src/components/chat/artifacts/lead-form.tsx");
		// defaultValues do react-hook-form precisa LER de payload.prefilledName
		// como prioridade — sem ?? "" antes do prefilledName.
		const usaNoDefault = /defaultValues:\s*\{\s*name:\s*payload\.prefilledName\s*\?\?\s*["']{2}/;
		expect(
			usaNoDefault.test(form),
			"src/components/chat/artifacts/lead-form.tsx precisa setar " +
				'`defaultValues: { name: payload.prefilledName ?? "", ... }` no useForm. ' +
				"Sem prioridade do payload, o form depende do fetch tardio /api/leads/[id] " +
				"e quando esse fetch sofre race (cliente offline / network slow) o campo " +
				"aparece vazio mesmo com contactName populado.",
		).toBe(true);

		// E o useEffect que faz o fetch tardio também precisa manter prioridade
		// do payload.prefilledName sobre data.name no reset — protege contra
		// alguém "limpar" o useEffect e jogar fora o prefill no reset.
		const usaNoReset =
			/reset\(\s*\{\s*[\s\S]{0,400}name:\s*payload\.prefilledName\s*\?\?\s*data\.name/;
		expect(
			usaNoReset.test(form),
			"o useEffect de fetch tardio em lead-form.tsx precisa fazer " +
				'`reset({ name: payload.prefilledName ?? data.name ?? "", ... })`. ' +
				"Sem essa prioridade, o fetch sobrescreve o prefill por data.name vazio " +
				"e o bug volta — mesmo cenário do screenshot Marina/Monique.",
		).toBe(true);
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

	it("o prompt menciona narrativa estratégica NO ESTÁGIO em que oferece o WhatsApp (anti-regressão)", () => {
		// FIX-5 (2026-06-05): a seção de opt-in saiu do SPECIALIST_BASE_PROMPT
		// (estável) e virou bloco DINÂMICO por estágio — pré-reveal o modelo nem
		// vê as frases (era exatamente o que ele imitava cedo demais). A
		// narrativa estratégica agora PRECISA estar no estágio "open" (pós-reveal,
		// optin pendente) — onde o agente de fato oferece.
		const combined = `${SYSTEM_PROMPT}\n\n${SPECIALIST_BASE_PROMPT}\n\n${whatsappOptinSection("open")}`;
		expect(hasWhatsappMention(combined)).toBe(true);
		expect(
			containsStrategicNarrative(combined),
			`Nenhum padrão de narrativa estratégica (instabilidade / não perder atendimento / continuar por lá) encontrado no prompt do estágio "open". O agente vai pedir WhatsApp de forma seca, sem motivar — taxa de aceite baixa.`,
		).toBe(true);
		// E o estágio "locked" (pré-reveal) NÃO carrega as frases-modelo.
		expect(containsStrategicNarrative(whatsappOptinSection("locked"))).toBe(false);
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
