import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemContext } from "@/lib/agent/orchestrator/system-context";
import { EphemeralTextFilter } from "@/lib/agent/orchestrator/sanitizer";
import { filterBaseByPhase, SPECIALIST_BASE_PROMPT } from "@/lib/agent/system-prompt";
import type { ConversationMetadata } from "@/lib/agent/personas";

// ============================================================================
// ANTI-REGRESSÃO DA DESAMARRA (ADR 2026-07-13, revoga-jornada-soberana)
// ----------------------------------------------------------------------------
// O agente foi engessado uma vez: roteiro do jornada.docx travado em copy
// literal, gates sem saída lateral, servidor respondendo por texto fixo sem
// consultar o modelo, sanitizer comendo as perguntas dele. O Kairo testou e o
// veredito foi "muito bitolado, responde sempre a mesma coisa".
//
// Estes testes NÃO travam a fala do agente — travam o CONTRÁRIO: que ninguém
// volte a travá-la. Cada um guarda uma porta pela qual a camisa de força
// entrou da primeira vez.
//
// Regra que eles protegem (CLAUDE.md, "Não engesse o agente"):
//   invariante verificável → código.  Conversa → é do modelo.
// ============================================================================

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

describe("desamarra — o servidor NUNCA responde no lugar do modelo", () => {
	it("não existe mais o curto-circuito do 'não entendi' (CLARIFY_LEAD_IN)", () => {
		// Era o pior caso: o usuário dizia "não entendi" e o servidor devolvia uma
		// frase fixa + REPETIA a mesma pergunta, sem nunca invocar o modelo.
		const gateQuestions = src("src/lib/agent/orchestrator/gate-questions.ts");
		const orchestrator = src("src/lib/agent/orchestrator/index.ts");
		expect(gateQuestions).not.toMatch(/export const CLARIFY_LEAD_IN/);
		expect(orchestrator).not.toMatch(/CLARIFY_LEAD_IN\s*[,}]/);
	});

	it("o 'não entendi' vira CONTEXTO pro modelo reformular — nunca uma frase pronta", () => {
		const ctx = buildSystemContext({
			knownName: "Madalena",
			newlyExtractedExperience: null,
			meta: {} as ConversationMetadata,
			confusedAboutGate: "credit",
		});
		const bloco = ctx.map((m) => m.content).join("\n");
		expect(bloco).toMatch(/NÃO ENTENDEU/i);
		expect(bloco).toMatch(/reformule/i);
		expect(bloco).toMatch(/NUNCA repita a mesma frase/i);
	});

	it("pergunta de exatidão/critério entrega os NÚMEROS REAIS ao modelo (não um template)", () => {
		// O invariante é "não inventar número" — e ele é garantido dando o número,
		// não escrevendo a resposta pelo modelo.
		const ctx = buildSystemContext({
			knownName: "Mario",
			newlyExtractedExperience: null,
			meta: {} as ConversationMetadata,
			exactnessFacts: { administradora: "ITAÚ", creditValue: 124_599, requestedValue: 120_000 },
		});
		const bloco = ctx.map((m) => m.content).join("\n");
		expect(bloco).toMatch(/124\.599/);
		expect(bloco).toMatch(/120\.000/);
		expect(bloco).toMatch(/NÃO invente nenhum outro número/i);
	});
});

describe("desamarra — a PERGUNTA é do modelo; o card só mostra o input", () => {
	it("o sanitizer não descarta mais a pergunta do modelo (discardHeldQuestion morreu)", () => {
		const sanitizer = src("src/lib/agent/orchestrator/sanitizer.ts");
		expect(sanitizer).not.toMatch(/discardHeldQuestion\(\): void/);
	});

	it("a pergunta segurada é emitida, e o runner sabe que o card deve calar", () => {
		const f = new EphemeralTextFilter();
		f.push("Entendi, o carro dando trabalho atrapalha tudo. ");
		f.push("E quanto custa esse Corolla hoje? ");
		expect(f.hasHeldQuestion()).toBe(true);
		expect(f.flush()).toMatch(/quanto custa esse Corolla hoje\?/i);
	});

	it("o gate carrega `modelAsked`, e os adapters suprimem a pergunta canônica", () => {
		expect(src("src/lib/agent/orchestrator/types.ts")).toMatch(/modelAsked\?: boolean/);
		// Web e WhatsApp: a canônica só sai se o modelo NÃO perguntou.
		expect(src("src/lib/web/adapter.ts")).toMatch(/ev\.modelAsked\s*\n?\s*\?\s*null/);
		expect(src("src/lib/whatsapp/adapter.ts")).toMatch(/ev\.modelAsked/);
	});

	it("o modelo sabe o que o funil quer descobrir — em INTENÇÃO, não em frase pronta", () => {
		const ctx = buildSystemContext({
			knownName: "Madalena",
			newlyExtractedExperience: null,
			meta: {} as ConversationMetadata,
			pendingGate: "identify",
		});
		const bloco = ctx.map((m) => m.content).join("\n");
		expect(bloco).toMatch(/CPF/i);
		expect(bloco).toMatch(/com as suas palavras/i);
		// E deixa explícito que o usuário pode puxar a conversa pro lado dele.
		expect(bloco).toMatch(/o funil espera/i);
	});
});

describe("desamarra — nenhuma frase canônica obrigatória", () => {
	it("o prompt não impõe formulação ipsis litteris em lugar nenhum", () => {
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/esta frase é canônica/i);
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/Não improvise outras formulações/i);
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/DEVE seguir EXATAMENTE este molde/i);
	});

	it("os directives não proíbem o modelo de perguntar nem o limitam a UMA frase", () => {
		const directives = src("src/lib/agent/orchestrator/directives.ts");
		expect(directives).not.toMatch(/NÃO faça pergunta/i);
		expect(directives).not.toMatch(/NÃO faca pergunta/i);
		expect(directives).not.toMatch(/APENAS UMA frase/i);
		// Mas CONTINUAM proibindo o modelo de chamar as tools de card — isso é
		// invariante (o card é server-side, senão duplica ou não sai).
		expect(directives).toMatch(/NÃO chame present_/);
	});
});

describe("desamarra — o prompt é fatiado por fase (o turno 1 não carrega regra de contrato)", () => {
	it("na qualificação, corta as seções de reveal e de fechamento", () => {
		const qualify = filterBaseByPhase(SPECIALIST_BASE_PROMPT, "qualify");
		expect(qualify).not.toMatch(/### Passo 5 "Contratar"/);
		expect(qualify).not.toMatch(/### Status da proposta/);
		expect(qualify).not.toMatch(/### Simulador de contemplação/);
		expect(qualify).not.toMatch(/### Apresentando resultados/);
	});

	it("corta pelo menos 1/3 do prompt na qualificação (era ~19k tokens em TODO turno)", () => {
		const qualify = filterBaseByPhase(SPECIALIST_BASE_PROMPT, "qualify");
		const corte = 1 - qualify.length / SPECIALIST_BASE_PROMPT.length;
		expect(corte).toBeGreaterThan(0.33);
	});

	it("NUNCA corta compliance, tom, anti-vazamento nem honestidade de busca — vale em toda fase", () => {
		for (const phase of ["qualify", "reveal", "closing", "terminal"] as const) {
			const out = filterBaseByPhase(SPECIALIST_BASE_PROMPT, phase);
			expect(out, `${phase}: ortografia`).toMatch(/## REGRA DURA — ortografia/);
			expect(out, `${phase}: tom`).toMatch(/## Tom geral/);
			expect(out, `${phase}: vazamento`).toMatch(/## Vazamento de instruções/);
			expect(out, `${phase}: taxa de contemplação`).toMatch(/"Taxa de contemplação" é PROIBIDA/);
			// REGRESSÃO REAL (1º teste ao vivo, 2026-07-14): estas duas tinham sido
			// cortadas em `qualify` — mas a BUSCA roda em qualify. Sem elas o modelo
			// chamou search_groups + recommend_groups no mesmo turno, com budget=0
			// inventado, e a Bevi devolveu "write conflict". São regras de HONESTIDADE,
			// não de fase.
			expect(out, `${phase}: não alucinar falha de busca`).toMatch(
				/NUNCA alucinar falha de busca/,
			);
			expect(out, `${phase}: carta não "bate exatamente"`).toMatch(/NUNCA afirme que a carta/);
		}
	});

	it("assim que a identidade é coletada, o prompt já entra em modo reveal (a busca vem a seguir)", () => {
		// O corte agressivo tem que ficar só na ENTRADA (nome/desejo/valor). Se ele
		// alcançasse o turno da busca, o modelo entraria no ponto mais delicado da
		// jornada sem as regras de como apresentar resultado — foi a regressão acima.
		const builder = src("src/lib/agent/agents/builder.ts");
		expect(builder).toMatch(/function promptPhaseFromMeta/);
		expect(builder).toMatch(/meta\.identityCollected === true \? "reveal" : "qualify"/);
	});

	it("em closing/terminal o prompt continua inteiro (nada se perde no fim do funil)", () => {
		expect(filterBaseByPhase(SPECIALIST_BASE_PROMPT, "closing")).toBe(SPECIALIST_BASE_PROMPT);
		expect(filterBaseByPhase(SPECIALIST_BASE_PROMPT, "terminal")).toBe(SPECIALIST_BASE_PROMPT);
	});
});

describe("desamarra — os INVARIANTES continuam de pé (o que é regra, segue regra)", () => {
	it("identidade antes da busca: search_groups só existe no toolset com identityCollected", () => {
		expect(src("src/lib/agent/orchestrator/tool-policy.ts")).toMatch(/identityCollected/);
	});

	it("número nunca é escrito pelo modelo: o payload do reveal é coagido server-side", () => {
		expect(src("src/lib/agent/orchestrator/recommendation-payload.ts")).toMatch(
			/coerceRevealCota/,
		);
	});

	it("compliance segue no sanitizer (não prometer o que não aconteceu)", () => {
		const sanitizer = src("src/lib/agent/orchestrator/sanitizer.ts");
		expect(sanitizer).toMatch(/isPrematureReservationClaim/);
		expect(sanitizer).toMatch(/isProactiveCallbackClaim/);
		expect(sanitizer).toMatch(/isDocumentReceiptClaim/);
	});
});
