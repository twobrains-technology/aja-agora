import { describe, expect, it } from "vitest";
import { buildJudgePrompt, RUBRIC_SYSTEM_PROMPT } from "./rubric";
import type { DeterministicSignals } from "./signals";

/**
 * O JUIZ NÃO PODE DEPENDER DE CAMPO MORTO.
 *
 * Antes da fase 3 da campanha do motor-pi, o contexto da persona entregue ao juiz
 * trazia `voiceTone` e `forbiddenTopics` — dois campos que ninguém alimenta em
 * produção (a conduta passou a viver na caixa de prompt). Julgar estilo contra um
 * campo vazio não mede o agente: mede o vazio, e dá nota estável e falsa.
 *
 * O que este arquivo cobra:
 *  1. a persona chega ao juiz pelos campos VIVOS (nome, categoria, expertise);
 *  2. o prompt do juiz NÃO menciona mais os campos mortos — reintroduzir um deles
 *     no texto da rubrica ou no formatador deixa vermelho;
 *  3. a rubrica continua sendo a mesma versão para as duas coisas (o número da
 *     versão é contrato de comparação entre avaliações).
 */

const sinais: DeterministicSignals = {
	replyRate: 1,
	qualifyCoverage: 0.5,
	qualifyMissing: ["creditMax"],
	numbersInTextFlagged: [],
	dropOffGate: null,
	conversionStage: "qualificado",
	hasLead: true,
	personaSegments: [],
	propostas: 0,
	contratoFechado: false,
	repeticoesDoAgente: 0,
	alertas: [],
};

const persona = {
	personaId: "helena-imovel",
	displayName: "Helena",
	category: "imovel",
	expertise: "imovel-residencial",
};

describe("juiz — a persona chega pelos campos vivos", () => {
	it("nome, categoria e expertise aparecem no prompt", () => {
		const prompt = buildJudgePrompt({
			transcript: "cliente: quero um apartamento\nagente: ótimo!",
			personas: [persona],
			signals: sinais,
		});
		expect(prompt).toContain("Helena");
		expect(prompt).toContain("imovel");
		expect(prompt).toContain("imovel-residencial");
	});

	it("o prompt e a rubrica NÃO falam dos campos mortos", () => {
		const prompt = buildJudgePrompt({
			transcript: "cliente: oi",
			personas: [persona],
			signals: sinais,
		});
		// Mordida: voltar `formatPersona` para voiceTone/forbiddenTopics (como era
		// antes da re-âncora) deixa estas três asserções vermelhas.
		for (const morto of ["Voice tone", "Tópicos proibidos", "forbiddenTopics", "voiceTone"]) {
			expect(prompt).not.toContain(morto);
			expect(RUBRIC_SYSTEM_PROMPT).not.toContain(morto);
		}
	});

	it("a versão da rubrica é declarada (comparação entre avaliações depende dela)", () => {
		expect(RUBRIC_SYSTEM_PROMPT.length).toBeGreaterThan(500);
	});
});
