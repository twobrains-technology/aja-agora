/**
 * Camada 1 (structural) — FIX-36: texto pré-tool não afirma achado.
 *
 * Bug real (Kairo dev 2026-06-12): ao clicar "Enviei meus dados pra buscar as
 * ofertas", o balão do agente dizia "Boa, Kairo! Encontrei opções na sua faixa"
 * AO MESMO TEMPO que o indicador "Buscando grupos" ainda girava. O texto pré-tool
 * afirmava o resultado de uma busca em andamento — e se a Bevi demora/falha, o
 * "Encontrei" vira mentira visível.
 *
 * Root cause (instruído, não alucinado): as frases-modelo pré-tool em
 * directives.ts + system-prompt.ts AFIRMAVAM achado ("Encontrei essas opcoes na
 * sua faixa"). Fix: viram TRANSIÇÃO honesta (não afirma resultado nem narra
 * mecânica), com regra de proibição explícita. O ANÚNCIO do achado (docx
 * "Encontramos 3 boas opcoes") só vem PÓS-tool — preservado.
 *
 * Tensão de design respeitada: a regra que proíbe meta-narrativa ("vou simular")
 * continua valendo — a solução NÃO troca "encontrei" por "vou buscar".
 *
 * Camadas complementares: Camada 2 (cassette) em tests/regression/agent-trajectory
 * .test.ts (FIX-36-PRE-TOOL-HONESTY); Camada 3 (eval) em agent-flow.eval.test.ts.
 */

import { describe, expect, it } from "vitest";
import {
	buildRangePickerDirective,
	buildSearchSummaryDirective,
	buildSimulateDirective,
} from "@/lib/agent/orchestrator/directives";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { SPECIALIST_BASE_PROMPT } from "@/lib/agent/system-prompt";

describe("FIX-36-PRE-TOOL-HONESTY — frases-modelo pré-tool não afirmam achado", () => {
	it("buildRangePickerDirective: a transição pré-search é honesta (sem 'Encontrei essas opcoes')", () => {
		const d = buildRangePickerDirective("Imóvel", "imovel", "creditMax=500000", "5.000");
		// A frase-modelo afirmativa do bug saiu.
		expect(d).not.toContain("Encontrei essas opcoes");
		// A transição honesta entrou.
		expect(d.toLowerCase()).toContain("bora ver o que encaixa");
		// E a proibição explícita está inline na directive.
		expect(d).toMatch(/PROIBIDO afirmar achado/i);
	});

	it("buildSimulateDirective: a introdução pré-simulate não afirma que o resultado já está na tela", () => {
		const d = buildSimulateDirective("Itaú", "g-1", 100_000);
		// "Aqui ta a simulacao" afirmava o resultado antes da tool — saiu.
		expect(d).not.toContain("Aqui ta a simulacao");
		expect(d).toMatch(/proibido afirmar que o resultado/i);
	});

	it("system-prompt: REGRA DURA de proibição presente (texto pré-tool nunca afirma achado, antes do retorno da tool)", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/texto pre-tool NUNCA afirma achado/i);
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toContain("antes do retorno da tool");
		// A regra nomeia as afirmações proibidas.
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/PROIBIDO[\s\S]{0,160}encontrei[\s\S]{0,160}antes do retorno da tool/i,
		);
	});

	it("system-prompt: o exemplo GOOD da ORDEM DE ENTREGA é a transição honesta (afirmativo antigo removido)", () => {
		// O GOOD afirmativo do bug ("Encontrei algumas opcoes na sua faixa, escolhe...") saiu.
		expect(SPECIALIST_BASE_PROMPT).not.toContain(
			"Encontrei algumas opcoes na sua faixa, escolhe uma pra simular:",
		);
		// O GOOD honesto entrou.
		expect(SPECIALIST_BASE_PROMPT).toContain(
			"Bora ver o que encaixa na sua faixa, escolhe uma pra simular:",
		);
	});

	it("system-prompt: tensão de design preservada — NÃO troca 'encontrei' por meta-narrativa ('vou buscar')", () => {
		// A proibição de meta-narrativa segue (a solução não vira "vou buscar").
		expect(SPECIALIST_BASE_PROMPT).toMatch(/proibido tambem narrar mecanica|"vou buscar"/i);
	});

	it("ANÚNCIO pós-tool PRESERVADO: o docx 'Encontramos 3 boas opções' segue no step pós-search (não foi over-corrigido)", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: { creditMin: 85_000, creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
		};
		const d = buildSearchSummaryDirective({ category: "auto", meta });
		// A copy do docx (afirmação PÓS-tool) NÃO foi removida por engano.
		expect(d).toContain("Encontramos 3 boas opcoes");
		// E a ordem honesta está garantida: tool ANTES de anunciar.
		expect(d).toMatch(/Chame search_groups[\s\S]*?ANTES de anunciar/i);
	});
});
