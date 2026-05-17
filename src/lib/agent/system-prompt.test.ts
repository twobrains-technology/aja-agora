import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "./system-prompt";

describe("system-prompt — overclaim de adequação financeira (bug #08)", () => {
	it("não contém frases subjetivas tipo 'cabe bem no seu orçamento'", () => {
		const vetadas = [
			/cabe (bem )?no (seu )?(orçamento|orcamento|bolso)/i,
			/dentro do seu (orçamento|orcamento)/i,
			/adequad[oa] (ao|pro) seu (orçamento|orcamento|perfil)/i,
		];
		for (const regex of vetadas) {
			expect(
				SYSTEM_PROMPT,
				`SYSTEM_PROMPT contém padrão vetado de overclaim: ${regex}`,
			).not.toMatch(regex);
		}
	});

	it("seção 'Textos de recomendação' usa template factual com %, R$ ou variável de porcentagem", () => {
		// A seção que substitui as antigas regras "cabe bem / dentro do" deve oferecer
		// um template factual (% do teto, valor absoluto). Sem template, o LLM vai
		// inventar adjetivo subjetivo de novo.
		const factualTemplatePresent =
			/\{percentual\}|\{percent\}|\{teto\}|% do (seu )?teto|R\$ \{parcela\}/i.test(SYSTEM_PROMPT);
		expect(factualTemplatePresent, "SYSTEM_PROMPT deve mencionar template factual de %/teto").toBe(
			true,
		);
	});

	it("não usa adjetivos subjetivos vetados em contexto de recomendação", () => {
		// Catch-all: adjetivos que comunicam "qualidade" da parcela sem base factual.
		// Permitidos em outros contextos (ex: "ótimo carro"), proibidos como adjetivo
		// da parcela. Faço grep contextual.
		const linesWithParcela = SYSTEM_PROMPT.split("\n").filter((l) => /parcel/i.test(l));
		const adjetivosVetados = /[óo]tim[ao]|excelente|perfeit[ao]|confort[áa]vel|tranquil[ao]/i;
		for (const line of linesWithParcela) {
			expect(
				line,
				`linha com 'parcel' contém adjetivo subjetivo vetado: "${line.trim()}"`,
			).not.toMatch(adjetivosVetados);
		}
	});
});
