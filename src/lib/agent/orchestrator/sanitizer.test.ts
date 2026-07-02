/**
 * FIX-188 (Camada 1 estrutural) — sanitizer de texto EFÊMERO × FINAL.
 *
 * Print do Kairo (2026-07-01): em turno multi-step, o modelo escreveu preâmbulos
 * de PROCESSO antes de cada tool-call ("deixa eu puxar os números reais", "vou
 * buscar as opções certas", "preciso primeiro buscar os grupos", "um segundo",
 * "deixa eu usar a ferramenta certa"), e TODOS foram persistidos/enviados como
 * mensagem final. A regra soft no prompt não segura (Lei 4); a BARREIRA REAL é
 * este sanitizer determinístico (Lei 1/4): preâmbulo de processo NUNCA vira bolha
 * — só a resposta de RESULTADO.
 *
 * Pós-onda-1 (FIX-186): o erro já vira diretiva e o runner suprime narração após
 * falha; então o sanitizer só cuida de preâmbulo de SUCESSO.
 */
import { describe, expect, it } from "vitest";
import {
	EphemeralTextFilter,
	isProcessPreamble,
	isTechnicalFallback,
	joinSeparator,
	normalizeGluedSentences,
	stripProcessPreamble,
} from "./sanitizer";

// Frases EXATAS do print (versão Kairo + versão Maria) que NÃO podem vazar.
const PREAMBULOS_DO_PRINT = [
	"Deixa eu puxar os números reais da sua faixa:",
	"Preciso buscar as opções reais primeiro antes de simular.",
	"Deixa eu buscar as melhores opções na sua faixa:",
	"Vou buscar as opções certas pra você:",
	"Preciso primeiro buscar os grupos disponíveis.",
	"Um segundo:",
	"Deixa eu usar a ferramenta certa pra isso:",
];

// Copy LEGÍTIMA (transição honesta / resultado) que TEM de sobreviver.
const COPY_LEGITIMA = [
	"Bora ver o que encaixa na sua faixa:",
	"Olha só o que a gente encontrou na sua faixa de R$ 130.000:",
	"Show, esse plano encaixa bem no seu orçamento.",
	"Você quer buscar em outra faixa?",
	"Vamos ver as opções juntos.",
];

describe("FIX-188 — isProcessPreamble reconhece preâmbulo de processo", () => {
	it("classifica como preâmbulo todas as frases de processo do print", () => {
		for (const p of PREAMBULOS_DO_PRINT) {
			expect(isProcessPreamble(p), `deveria dropar: "${p}"`).toBe(true);
		}
	});

	it("NÃO classifica copy legítima como preâmbulo (zero falso-positivo)", () => {
		for (const c of COPY_LEGITIMA) {
			expect(isProcessPreamble(c), `NÃO pode dropar: "${c}"`).toBe(false);
		}
	});

	it("segmento vazio não é preâmbulo", () => {
		expect(isProcessPreamble("")).toBe(false);
		expect(isProcessPreamble("   ")).toBe(false);
	});
});

describe("FIX-188 — stripProcessPreamble limpa o texto composto", () => {
	it("dropa o segmento de preâmbulo e preserva a saudação/resultado colados", () => {
		const input =
			"Boa, Kairo! Pra simular direitinho, deixa eu puxar os números reais da sua faixa:";
		// A saudação sobrevive; o preâmbulo (2ª frase) some.
		const out = stripProcessPreamble(input);
		expect(out).toContain("Boa, Kairo!");
		expect(out.toLowerCase()).not.toContain("deixa eu puxar");
	});

	it("reconstrói o empilhamento do print SEM nenhum preâmbulo, mantendo o resultado", () => {
		const input =
			"Deixa eu buscar as melhores opções na sua faixa: " +
			"Vou buscar as opções certas pra você: " +
			"Preciso primeiro buscar os grupos disponíveis. Um segundo: " +
			"Olha só o que a gente encontrou na sua faixa:";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("deixa eu buscar");
		expect(out.toLowerCase()).not.toContain("vou buscar");
		expect(out.toLowerCase()).not.toContain("preciso primeiro buscar");
		expect(out.toLowerCase()).not.toContain("um segundo");
		// Só o resultado sobra.
		expect(out).toContain("Olha só o que a gente encontrou na sua faixa:");
	});

	it("não mexe em texto 100% legítimo", () => {
		const input = "Olha só o que a gente encontrou na sua faixa de R$ 130.000:";
		expect(stripProcessPreamble(input)).toBe(input);
	});

	it("string vazia passa incólume", () => {
		expect(stripProcessPreamble("")).toBe("");
	});
});

describe("FIX-188 — EphemeralTextFilter (stream por frase, nada vaza ao vivo)", () => {
	it("preâmbulo partido entre deltas NUNCA é emitido", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("Deixa eu ");
		emitted += f.push("buscar as opções");
		emitted += f.push(" certas pra você:");
		emitted += f.flush();
		expect(emitted).toBe("");
	});

	it("frase legítima só é emitida quando COMPLETA, uma vez", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("Olha só o que a gente");
		// ainda incompleta: nada sai
		expect(emitted).toBe("");
		emitted += f.push(" encontrou na sua faixa:");
		emitted += f.flush();
		expect(emitted).toContain("Olha só o que a gente encontrou na sua faixa:");
	});

	it("mistura: preâmbulo dropado, resultado preservado no mesmo stream", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		for (const delta of [
			"Deixa eu buscar as opções na sua faixa: ",
			"Olha só o que ",
			"encontrei pra você:",
		]) {
			emitted += f.push(delta);
		}
		emitted += f.flush();
		expect(emitted.toLowerCase()).not.toContain("deixa eu buscar");
		expect(emitted).toContain("Olha só o que encontrei pra você:");
	});

	it("flush do trailing sem pontuação final também passa pelo filtro", () => {
		const f = new EphemeralTextFilter();
		let emitted = f.push("Vou buscar os grupos agora"); // sem . no fim
		expect(emitted).toBe(""); // incompleto, segurado
		emitted += f.flush(); // trailing → filtrado (é preâmbulo) → dropado
		expect(emitted).toBe("");
	});
});

describe("FIX-190 — fallback técnico ('atualiza a página') é dropado em runtime (barreira em código)", () => {
	const REFRESH_SEGMENTS = [
		"Atualiza a página e tenta de novo.",
		"Recarregue a página, por favor.",
		"Dá um refresh aí que resolve.",
		"Tenta de novo recarregando a tela.",
	];

	it("isTechnicalFallback pega as frases de refresh", () => {
		for (const s of REFRESH_SEGMENTS) {
			expect(isTechnicalFallback(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima que fala de 'página'/'atualizar' sem instruir refresh", () => {
		expect(isTechnicalFallback("Vou atualizar o valor da simulação pra você.")).toBe(false);
		expect(isTechnicalFallback("Essa página da simulação mostra tudo.")).toBe(false);
	});

	it("stripProcessPreamble também remove o segmento de refresh", () => {
		const input = "Ops, deu um probleminha. Atualiza a página e tenta de novo. Beleza?";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("atualiza a página");
		// o resto sobrevive
		expect(out).toContain("Ops, deu um probleminha.");
	});

	it("EphemeralTextFilter NÃO emite a frase de refresh ao vivo", () => {
		const f = new EphemeralTextFilter();
		let emitted = f.push("Atualiza a página e tenta de novo.");
		emitted += f.flush();
		expect(emitted.toLowerCase()).not.toContain("atualiza a página");
	});
});

describe("FIX-189 — normalizeGluedSentences separa falas coladas pelo modelo", () => {
	it("separa 'corretos.Show' (frase colada sem espaço) em parágrafos", () => {
		const input = "com os dados corretos.Show, esse plano encaixa bem.";
		const out = normalizeGluedSentences(input);
		expect(out).not.toContain("corretos.Show");
		expect(out).toContain("corretos.\n\nShow");
	});

	it("NÃO mexe em valores monetários (R$ 1.000,00) nem em números com ponto", () => {
		expect(normalizeGluedSentences("O valor é R$ 1.000,00 hoje.")).toBe("O valor é R$ 1.000,00 hoje.");
		expect(normalizeGluedSentences("são 72.000 no total")).toBe("são 72.000 no total");
	});

	it("NÃO mexe em sigla com pontos (maiúscula antes do ponto)", () => {
		expect(normalizeGluedSentences("U.S.A. é longe")).toBe("U.S.A. é longe");
	});

	it("NÃO mexe em frase já espaçada corretamente", () => {
		const ok = "Tudo certo. Show, esse plano encaixa.";
		expect(normalizeGluedSentences(ok)).toBe(ok);
	});

	it("string vazia passa incólume", () => {
		expect(normalizeGluedSentences("")).toBe("");
	});
});

describe("FIX-188 — joinSeparator evita colagem de falas distintas", () => {
	it("insere \\n\\n quando o acumulado termina sem espaço e o próximo começa sem espaço", () => {
		expect(joinSeparator("...na sua faixa:", "Olha")).toBe("\n\n");
	});

	it("NÃO insere separador quando já há espaço em volta", () => {
		expect(joinSeparator("...na sua faixa: ", "Olha")).toBe("");
		expect(joinSeparator("...na sua faixa:", " Olha")).toBe("");
	});

	it("nada a separar quando algum lado é vazio", () => {
		expect(joinSeparator("", "Olha")).toBe("");
		expect(joinSeparator("texto", "")).toBe("");
	});
});
