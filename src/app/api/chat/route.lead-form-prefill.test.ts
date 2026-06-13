/**
 * FIX-29/FIX-34 — funil canônico pós-reveal (atualizado 2026-06-12).
 *
 * Cenário A (ex-"Bug A", invertido): o clique "Tenho interesse" no card de
 * simulação NÃO emite mais lead_form ("te conectar com nosso consultor"). O
 * avanço pós-reveal é self-service: decision_prompt → contract_form. O handler
 * dirige o turno via pipeDirectiveTurn (stub aqui pra determinismo). O clique
 * "Ajustar valor" reabre o what-if, sem iniciar fechamento. (O prefilledName
 * segue valendo SÓ pro componente lead-form da fase qualify — contrato de tipo
 * preservado nos source-grep abaixo.)
 *
 * Cenário B (mantido): inspeciona o contrato configuracional do agente — o
 * system_prompt / examples seedados (mig 0016) instruem a oferta proativa de
 * WhatsApp com narrativa estratégica. Como o modelo é não-determinístico, o
 * teste do contrato é o que captura a regressão de forma estável.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads, personas } from "@/db/schema";
import {
	SPECIALIST_BASE_PROMPT,
	SYSTEM_PROMPT,
	whatsappOptinSection,
} from "@/lib/agent/system-prompt";
import { POST } from "./route";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

// FIX-29: o handler `interest`/`adjust-value` deixou de emitir lead_form
// determinístico e passou a dirigir um turno via pipeDirectiveTurn (decisão /
// ajuste). Stub do adapter pra capturar a directive sem chamar a LLM real —
// mantém o teste determinístico (o resto do adapter segue real).
const pipeDirectiveTurnMock = vi.fn((_args: { directive: string }) => Promise.resolve());
vi.mock("@/lib/web/adapter", async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import("@/lib/web/adapter");
	return {
		...actual,
		pipeDirectiveTurn: (args: { directive: string }) => pipeDirectiveTurnMock(args),
	};
});

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

describe("FIX-29 — POST /api/chat action=interest pós-reveal NÃO emite lead_form (vai pra decisão)", () => {
	let convId: string;

	beforeEach(async () => {
		pipeDirectiveTurnMock.mockClear();
		// Cenário pós-reveal real: usuário viu a recomendação/simulação e clica
		// "Tenho interesse" no card. contactName já capturado.
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Monique",
				metadata: {
					currentCategory: "auto",
					revealCompleted: true,
					searchDispatched: true,
					simulatorOfferDispatched: true,
					recommendedAdministradora: "Rodobens",
				},
			})
			.returning();
		convId = c.id;
	});

	afterEach(async () => {
		await cleanup(convId);
	});

	it("NÃO emite artifact lead_form no stream (o avanço é decision → contract, não captura de lead)", async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				action: { kind: "interest", administradora: "Rodobens", label: "Tenho interesse" },
			}),
		);
		expect(res.status).toBe(200);
		const payload = await extractLeadFormPayload(res);
		expect(payload).toBeNull();
	});

	// FIX-38 (2026-06-12): o clique explícito "Tenho interesse" no plano em tela
	// JÁ é o sinal de avanço — vai DIRETO pro passo 5 (present_contract_form),
	// SEM o card de decisão "Esse plano faz sentido?" (a dupla confirmação por
	// construção do FIX-34). Marca decisionDispatched pra idempotência (o gate
	// "decision" do funil — caminho ambíguo — não reaparece depois).
	it("FIX-38: dirige o avanço pro passo 5 (present_contract_form) SEM card de decisão e persiste decisionDispatched", async () => {
		await (
			await POST(
				makeReq({
					conversationId: convId,
					action: { kind: "interest", administradora: "Rodobens", label: "Tenho interesse" },
				}),
			)
		).text();

		// O handler dispara o turno de AVANÇO via pipeDirectiveTurn — UM passo.
		expect(pipeDirectiveTurnMock).toHaveBeenCalledTimes(1);
		const arg = pipeDirectiveTurnMock.mock.calls[0]?.[0];
		// Avanço direto pro contrato — NÃO o card de decisão (sem dupla confirmação).
		expect(arg.directive).toContain("present_contract_form");
		expect(arg.directive).not.toContain("present_decision_prompt");
		// Invariante FIX-34: NUNCA captura de lead pra consultor humano.
		expect(arg.directive).not.toContain("present_lead_form");

		// Estado avança (determinístico, independe da LLM): idempotência preservada.
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
		expect(meta.decisionDispatched).toBe(true);
	});

	it("action=adjust-value reabre o ajuste (what-if) — sem lead_form, sem fechamento", async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				action: {
					kind: "adjust-value",
					administradora: "Rodobens",
					creditValue: 200000,
					label: "Ajustar valor",
				},
			}),
		);
		expect(res.status).toBe(200);
		expect(await extractLeadFormPayload(res)).toBeNull();

		expect(pipeDirectiveTurnMock).toHaveBeenCalledTimes(1);
		const arg = pipeDirectiveTurnMock.mock.calls[0]?.[0];
		expect(arg.directive).not.toContain("present_lead_form");
		expect(arg.directive).not.toContain("present_contract_form");
		expect(arg.directive).toMatch(/ajustar|novo valor/i);

		// "Ajustar valor" NÃO inicia fechamento — decisionDispatched permanece falso.
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
		expect(meta.decisionDispatched ?? false).toBe(false);
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

	it("FIX-38 — src/app/api/chat/route.ts: handler `interest` vai DIRETO pro avanço (sem card de decisão), marca decisionDispatched, sem lead_form", () => {
		const route = readSource("src/app/api/chat/route.ts");
		// Isola o corpo do branch interest (até o próximo branch de action).
		const interestBlock =
			route.match(
				/body\.action\?\.kind === "interest"[\s\S]*?(?=\n\t+\/\/|\n\t+if \(body\.action\?\.kind)/,
			)?.[0] ?? "";
		expect(
			interestBlock.length,
			"branch `body.action?.kind === 'interest'` não foi encontrado em route.ts",
		).toBeGreaterThan(0);
		// FIX-29/FIX-34: o avanço pós-reveal NUNCA é captura de lead.
		expect(
			interestBlock.includes("lead_form"),
			"handler `interest` NÃO pode emitir lead_form — o avanço pós-reveal é self-service.",
		).toBe(false);
		// FIX-38: clique explícito vai DIRETO pro passo 5 (avanço), sem dupla confirmação.
		expect(
			interestBlock.includes("buildAdvanceToContractDirective"),
			"FIX-38: handler `interest` precisa dirigir buildAdvanceToContractDirective (passo 5) no clique explícito.",
		).toBe(true);
		expect(
			interestBlock.includes("buildDecisionPromptDirective"),
			"FIX-38: o clique EXPLÍCITO 'Tenho interesse' NÃO passa mais pelo card de decisão (dupla confirmação por construção). O decision_prompt fica nos caminhos ambíguos (simulator-offer 'Agora não', satisfação difusa em texto).",
		).toBe(false);
		// Idempotência: marca decisionDispatched pra o gate "decision" do funil não reaparecer
		// E pra a tool-policy liberar present_contract_form (fase "closing").
		expect(
			interestBlock.includes("decisionDispatched"),
			"FIX-38: handler `interest` precisa marcar decisionDispatched (idempotência + libera present_contract_form na fase closing da tool-policy).",
		).toBe(true);
	});

	it("FIX-29 — route.ts tem handler `adjust-value` que reabre o ajuste sem fechamento", () => {
		const route = readSource("src/app/api/chat/route.ts");
		expect(
			/body\.action\?\.kind === "adjust-value"/.test(route),
			"route.ts precisa ter branch `body.action?.kind === 'adjust-value'` (clique 'Ajustar valor').",
		).toBe(true);
		const adjustBlock =
			route.match(
				/body\.action\?\.kind === "adjust-value"[\s\S]*?(?=\n\t+\/\/|\n\t+if \(body\.action\?\.kind)/,
			)?.[0] ?? "";
		expect(adjustBlock.includes("lead_form")).toBe(false);
		expect(/buildAdjustValueDirective/.test(adjustBlock)).toBe(true);
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
