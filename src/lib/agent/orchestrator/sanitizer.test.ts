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
	isBannedLexicon,
	isPrazoReductionClaim,
	isPrematureReservationClaim,
	isProcessPreamble,
	isTaxaContemplacaoClaim,
	isTechnicalFallback,
	joinSeparator,
	normalizeGluedSentences,
	splitSegments,
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

// FIX-248 (rodada 3, Fable r2, N1 P0): "Juntando R$ 4." | "000,00 por mês" —
// o splitter tratava o PONTO DE MILHAR como fim de frase e quebrava o valor
// monetário em 2 bolhas ao vivo. Superfície criada pela narração de dinheiro
// do FIX-241 ("juntando R$ 4.000,00 por mês, lá pelo mês X..."). Guarda de
// dígito: um "." colado a um dígito (separador de milhar/decimal) NUNCA é
// fronteira de sentença — só um "." colado a LETRA é.
describe("FIX-248 — guarda de dígito no splitter (valor monetário não quebra em 2 bolhas)", () => {
	it("splitSegments NÃO quebra 'R$ 4.000,00' no ponto de milhar", () => {
		const segments = splitSegments("Juntando R$ 4.000,00 por mês. Isso ajuda muito.");
		expect(segments.some((s) => /^000,00/.test(s.trim()))).toBe(false);
		// reconstrução é lossless (join sem separador reconstitui o original).
		expect(segments.join("")).toBe("Juntando R$ 4.000,00 por mês. Isso ajuda muito.");
	});

	it("splitSegments ainda quebra frases reais (fim de frase real preservado)", () => {
		const segments = splitSegments("Primeira frase. Segunda frase.");
		expect(segments).toEqual(["Primeira frase.", " Segunda frase."]);
	});

	it("splitSegments lida com milhar duplo ('R$ 1.234.567,00') sem quebrar em nenhum ponto interno", () => {
		const segments = splitSegments("O total foi R$ 1.234.567,00 no fim das contas.");
		expect(segments).toHaveLength(1);
	});

	it("EphemeralTextFilter: 'Juntando R$ 4.' seguido de '000,00 por mês.' emite como UMA bolha só", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("Juntando R$ 4.");
		// o "." de milhar NÃO pode ter disparado emissão prematura aqui.
		expect(emitted).toBe("");
		emitted += f.push("000,00 por mês, lá pelo mês 11 dá.");
		emitted += f.flush();
		expect(emitted).toContain("Juntando R$ 4.000,00 por mês");
		// NUNCA aparece o valor cortado ao meio.
		expect(emitted).not.toContain("R$ 4.\n");
	});

	it("EphemeralTextFilter: frase legítima após o valor monetário ainda quebra normalmente", () => {
		const f = new EphemeralTextFilter();
		let emitted = "";
		emitted += f.push("O valor é R$ 4.000,00. ");
		emitted += f.push("Show, vamos em frente.");
		emitted += f.flush();
		expect(emitted).toContain("O valor é R$ 4.000,00.");
		expect(emitted).toContain("Show, vamos em frente.");
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

describe("FIX-234 — redução de prazo é PROIBIDA (D7: abatimento vira parcela menor, nunca prazo menor)", () => {
	const REDUCAO_PRAZO_SEGMENTS = [
		"Com esse lance dá pra reduzir o prazo do seu consórcio.",
		"Isso ajuda a terminar antes do previsto.",
		"Assim você consegue quitar antes do prazo final.",
	];

	it("isPrazoReductionClaim pega as frases de redução de prazo", () => {
		for (const s of REDUCAO_PRAZO_SEGMENTS) {
			expect(isPrazoReductionClaim(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima sobre prazo (menção neutra, sem prometer redução)", () => {
		expect(isPrazoReductionClaim("O prazo desse grupo é de 60 meses.")).toBe(false);
		expect(isPrazoReductionClaim("A parcela fica menor com o abatimento.")).toBe(false);
	});

	it("stripProcessPreamble também remove o segmento de redução de prazo", () => {
		const input = "Boa notícia! Com esse lance dá pra reduzir o prazo do seu consórcio. Vamos seguir?";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("reduzir o prazo");
		expect(out).toContain("Boa notícia!");
	});
});

describe("FIX-234 — reserva/garantia PREMATURA é PROIBIDA (invariante #9: nada foi contratado ainda)", () => {
	const RESERVA_PREMATURA_SEGMENTS = [
		"Sua cota já está garantida com esse grupo.",
		"Sua cota está garantida, pode ficar tranquilo.",
		"Já reservado, parabéns!",
		"Você já está no grupo, é só aguardar.",
	];

	it("isPrematureReservationClaim pega as frases de reserva/garantia prematura", () => {
		for (const s of RESERVA_PREMATURA_SEGMENTS) {
			expect(isPrematureReservationClaim(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima que não afirma reserva/garantia", () => {
		expect(isPrematureReservationClaim("Vamos ver se esse grupo faz sentido pra você.")).toBe(
			false,
		);
	});

	it("stripProcessPreamble também remove o segmento de reserva prematura", () => {
		const input = "Boa! Sua cota já está garantida com esse grupo. Só falta assinar depois.";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("garantida");
		expect(out).toContain("Boa!");
	});
});

// FIX-243 (rodada 2, Fable r1, §D5.2 do veredito) — B2 T5, o agente disse "A
// ITAÚ se destaca pela boa taxa de contemplação e uma taxa de administração de
// 13,46% — uma das mais baixas da faixa". `taxaContemplacao` é campo PROIBIDO
// (semântica não documentada, spec 05); o guard existente cobre só payload/UI
// (no-taxa-contemplacao.guard.test.ts) — a FALA do LLM vazava o conceito como
// argumento de venda. Fonte permitida de sinal de contemplação:
// contemplados/mês (contagem real), nunca "taxa".
describe("FIX-243 — 'taxa de contemplação' é PROIBIDA na fala (campo sem semântica documentada)", () => {
	const TAXA_CONTEMPLACAO_SEGMENTS = [
		"A ITAÚ se destaca pela boa taxa de contemplação e uma taxa de administração de 13,46%.",
		"Esse grupo tem uma taxa de contemplação alta.",
		"A taxa de contemplação dessa oferta é de 60%.",
		"Gosto dessa oferta pela taxa de contemplação baixa.",
	];

	it("isTaxaContemplacaoClaim pega as frases que citam taxa de contemplação", () => {
		for (const s of TAXA_CONTEMPLACAO_SEGMENTS) {
			expect(isTaxaContemplacaoClaim(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima sobre contemplação (contagem real, sem 'taxa')", () => {
		expect(isTaxaContemplacaoClaim("Esse grupo contempla 8 pessoas por mês.")).toBe(false);
		expect(isTaxaContemplacaoClaim("A contemplação pode vir por sorteio ou lance.")).toBe(false);
		expect(isTaxaContemplacaoClaim("A taxa de administração é de 13,46%.")).toBe(false);
	});

	it("stripProcessPreamble também remove o segmento de taxa de contemplação", () => {
		const input =
			"Boa! A ITAÚ se destaca pela boa taxa de contemplação e uma taxa de administração de 13,46%. Vamos seguir?";
		const out = stripProcessPreamble(input);
		expect(out.toLowerCase()).not.toContain("taxa de contemplação");
		expect(out).toContain("Boa!");
	});
});

describe("FIX-234 — léxico banido (tom consultivo, não 'brother')", () => {
	const LEXICO_BANIDO_SEGMENTS = [
		"Saco, né? Entendo bem.",
		"Dá pra furar a fila com um lance.",
		"Todo carro-problema incomoda.",
		"Qual carro tá na sua cabeça?",
	];

	it("isBannedLexicon pega as frases do léxico banido", () => {
		for (const s of LEXICO_BANIDO_SEGMENTS) {
			expect(isBannedLexicon(s), `deveria dropar: "${s}"`).toBe(true);
		}
	});

	it("NÃO pega copy legítima equivalente (as versões ✅ do docx)", () => {
		expect(isBannedLexicon("Entendo bem — quando o carro dá trabalho, atrapalha tudo.")).toBe(
			false,
		);
		expect(isBannedLexicon("Dá pra antecipar a contemplação com um lance.")).toBe(false);
		expect(isBannedLexicon("Qual carro você tem em mente?")).toBe(false);
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
