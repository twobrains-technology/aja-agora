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
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { buildWhatsappOptinDirective } from "@/lib/agent/orchestrator/directives";
import { whatsappOptinSection } from "@/lib/agent/system-prompt";
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
	const req = new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": "127.0.0.1",
		},
		body: JSON.stringify(body),
	});
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

	// FIX-311 (r10-4, happy-path-ceremony): REVERTE a decisão do FIX-38 — o
	// clique explícito "Tenho interesse" não dispensa mais a cerimônia
	// scarcity→decision_prompt. Achado real (investigação de causa-raiz): os 2
	// dossiês limpos investigados nunca mostravam scarcity/decision_prompt
	// porque este fast-path pulava direto pro fecho — "aceitar de cara" não é
	// dispensa de cuidado. Agora o clique PASSA pela mesma cerimônia de quem
	// hesitou e só ENTÃO avança pro passo 5 (present_contract_form).
	// Idempotência preservada: decisionDispatched segue marcado ANTES do
	// avanço, e quem já viu a cerimônia por outro caminho não a vê de novo.
	it("FIX-311: dirige a cerimônia scarcity→decision_prompt e SÓ ENTÃO o avanço pro passo 5 (present_contract_form), persistindo decisionDispatched", async () => {
		await (
			await POST(
				makeReq({
					conversationId: convId,
					action: { kind: "interest", administradora: "Rodobens", label: "Tenho interesse" },
				}),
			)
		).text();

		// 3 passos no MESMO turno: scarcity, decision_prompt, avanço.
		expect(pipeDirectiveTurnMock).toHaveBeenCalledTimes(3);
		const directives = pipeDirectiveTurnMock.mock.calls.map(
			(call) => (call[0] as { directive: string }).directive,
		);
		expect(directives[0]).toContain("present_scarcity");
		expect(directives[1]).toContain("present_decision_prompt");
		expect(directives[2]).toContain("present_contract_form");
		// Invariante FIX-34 (segue valendo): NUNCA captura de lead pra consultor humano.
		expect(directives[2]).not.toContain("present_lead_form");

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

	it("FIX-311 — src/app/api/chat/route.ts: handler `interest` passa pela cerimônia scarcity→decision_prompt ANTES do avanço (passo 5), marca decisionDispatched, sem lead_form", () => {
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
		expect(
			interestBlock.includes("buildAdvanceToContractDirective"),
			"handler `interest` precisa dirigir buildAdvanceToContractDirective (passo 5) no clique explícito.",
		).toBe(true);
		// FIX-311 (r10-4, investigação de causa-raiz): REVERTE o FIX-38 — o
		// clique explícito "Tenho interesse" AGORA passa pela mesma cerimônia
		// scarcity→decision_prompt de quem hesitou, antes do avanço. Achado real:
		// pulá-la deixava scarcity/decision_prompt fora dos 2 dossiês limpos
		// investigados (o fast-path ia direto pro fecho).
		expect(
			interestBlock.includes("pipeClosingCeremony"),
			"FIX-311: handler `interest` precisa religar a cerimônia extraída (pipeClosingCeremony) antes do avanço — aceitar de cara não dispensa scarcity/decision_prompt.",
		).toBe(true);
		// Idempotência: marca decisionDispatched pra o gate "decision" do funil não reaparecer
		// E pra a tool-policy liberar present_contract_form (fase "closing").
		expect(
			interestBlock.includes("decisionDispatched"),
			"handler `interest` precisa marcar decisionDispatched (idempotência + libera present_contract_form na fase closing da tool-policy).",
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

describe("Bug B — o directive de opt-in de WhatsApp instrui narrativa estratégica (anti-regressão)", () => {
	/**
	 * Histórico: o system-prompt dizia "chame present_whatsapp_optin" sem
	 * narrativa — o agente pedia o WhatsApp seco, taxa de aceite baixa. FIX-5
	 * resolveu isolando a narrativa num bloco dinâmico por estágio
	 * (whatsappOptinSection).
	 *
	 * FIX-280 (loop r9, G4): present_whatsapp_optin SAIU do toolset do LLM —
	 * a narrativa (E a emissão do card) viraram 100% responsabilidade do
	 * orchestrator (`buildWhatsappOptinDirective`, orchestrator/directives.ts),
	 * nunca mais do system-prompt/few-shot examples da persona. O contrato
	 * anti-regressão migra pra essa função: é ela que SEMPRE roda no turno em
	 * que o opt-in é oferecido, incondicionalmente.
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

	it("buildWhatsappOptinDirective('open') carrega a narrativa estratégica (anti-regressão)", () => {
		const directive = buildWhatsappOptinDirective("open");
		expect(hasWhatsappMention(directive)).toBe(true);
		expect(
			containsStrategicNarrative(directive),
			`Nenhum padrão de narrativa estratégica (instabilidade / não perder atendimento / continuar por lá) encontrado no directive "open". O agente vai pedir WhatsApp de forma seca, sem motivar — taxa de aceite baixa.`,
		).toBe(true);
		// E o estágio ambiente "locked" (pré-reveal) NÃO carrega as frases-modelo.
		expect(containsStrategicNarrative(whatsappOptinSection("locked"))).toBe(false);
	});
});
