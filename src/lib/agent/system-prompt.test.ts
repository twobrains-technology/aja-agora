import { describe, it, expect } from "vitest";
import { SHARED_SPECIALIST_EXAMPLES, SYSTEM_PROMPT } from "./system-prompt";

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

describe("Helena 1ª fala calorosa (bug #04)", () => {
	const helenaFirstTurn = SHARED_SPECIALIST_EXAMPLES.find(
		(ex) => ex.context?.includes("Primeiro turno apos transicao"),
	);

	it("existe example shared pro primeiro turno do specialist", () => {
		expect(helenaFirstTurn, "SHARED_SPECIALIST_EXAMPLES deve ter entry 'Primeiro turno apos transicao'").toBeDefined();
	});

	it("primeira fala contém palavra-chave de calor/entusiasmo", () => {
		expect(helenaFirstTurn).toBeDefined();
		if (!helenaFirstTurn) return;
		const calor = /legal|show|[óo]tim[ao]|animad[oa]|bora|que (bom|legal|[óo]tim[ao])|adoro|amei|que (massa|bacana)/i;
		expect(
			helenaFirstTurn.assistantResponse,
			`fala da Helena não tem palavra-chave de calor: "${helenaFirstTurn.assistantResponse}"`,
		).toMatch(calor);
	});

	it("primeira fala NÃO usa abertura robótica formal", () => {
		expect(helenaFirstTurn).toBeDefined();
		if (!helenaFirstTurn) return;
		const robotico = /sou (a|o) [a-z]+, su[ao] (assistente|consultor)/i;
		expect(helenaFirstTurn.assistantResponse).not.toMatch(robotico);
	});

	it("primeira fala menciona o domínio (imóvel/casa/apartamento) dentro das primeiras 2 frases", () => {
		expect(helenaFirstTurn).toBeDefined();
		if (!helenaFirstTurn) return;
		const primeirasDuas = helenaFirstTurn.assistantResponse
			.split(/[.!?]/)
			.slice(0, 2)
			.join(". ");
		const dominio = /im[óo]vel|casa|apartamento/i;
		expect(primeirasDuas).toMatch(dominio);
	});
});

describe("Primeira vez = explicação básica inline (bug #15)", () => {
	const firstTimeExample = SHARED_SPECIALIST_EXAMPLES.find((ex) =>
		ex.context?.includes("Primeira vez") || ex.userMessage?.toLowerCase().includes("primeira vez"),
	);

	it("existe example shared pra usuário 'primeira vez'", () => {
		expect(
			firstTimeExample,
			"SHARED_SPECIALIST_EXAMPLES deve ter entry pra experiencePrev='first'",
		).toBeDefined();
	});

	it("explicação contém pelo menos 3 termos didáticos básicos de consórcio", () => {
		expect(firstTimeExample).toBeDefined();
		if (!firstTimeExample) return;
		const termos = [
			/sem juros/i,
			/grupo de pessoas/i,
			/sorteio/i,
			/lance/i,
			/assembleia/i,
			/contemplad/i,
			/taxa de admin/i,
		];
		const matches = termos.filter((t) => t.test(firstTimeExample.assistantResponse));
		expect(
			matches.length,
			`explicação tem só ${matches.length} termos didáticos (mínimo 3): "${firstTimeExample.assistantResponse}"`,
		).toBeGreaterThanOrEqual(3);
	});
});
