import { describe, it, expect } from "vitest";
import {
	SHARED_SPECIALIST_EXAMPLES,
	SPECIALIST_BASE_PROMPT,
	SYSTEM_PROMPT,
} from "./system-prompt";

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

describe("Anglicismos no copy ao usuário (bug #07)", () => {
	const anglicismos = ["range", "nice", "cool", "feedback", "insight", "tip", "hack"];

	for (const palavra of anglicismos) {
		it(`assistantResponse dos shared examples NÃO contém '${palavra}'`, () => {
			for (const ex of SHARED_SPECIALIST_EXAMPLES) {
				const regex = new RegExp(`\\b${palavra}\\b`, "i");
				expect(
					ex.assistantResponse,
					`example "${ex.context}" contém anglicismo '${palavra}': "${ex.assistantResponse}"`,
				).not.toMatch(regex);
			}
		});
	}

	it("substituição de 'range' → 'faixa' confirmada (pelo menos 1 uso de 'faixa' em algum example)", () => {
		const hasFaixa = SHARED_SPECIALIST_EXAMPLES.some((ex) => /\bfaixa\b/i.test(ex.assistantResponse));
		expect(hasFaixa, "esperado pelo menos 1 uso de 'faixa' como substituto de 'range'").toBe(true);
	});
});

describe("Palavra 'card' no copy ao usuário (bug #14)", () => {
	it("assistantResponse dos shared examples NÃO contém 'card'", () => {
		for (const ex of SHARED_SPECIALIST_EXAMPLES) {
			expect(
				ex.assistantResponse,
				`example "${ex.context}" usa 'card' (jargão técnico): "${ex.assistantResponse}"`,
			).not.toMatch(/\bcards?\b/i);
		}
	});

	it("SPECIALIST_BASE_PROMPT não tem fala literal 'no card que mandei/apareceu' (texto que vai pro user)", () => {
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/no card que (mandei|apareceu|mostrei)/i);
	});

	it("SPECIALIST_BASE_PROMPT não menciona 'card de recomendacao' (jargão técnico exposto)", () => {
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/no card de (recomenda[cç][aã]o|recomendado)/i);
	});
});

describe("Comparador consórcio × financiamento (bug #17)", () => {
	it("SYSTEM_PROMPT não tem diretiva 'NAO compare com financiamento'", () => {
		expect(SYSTEM_PROMPT).not.toMatch(/n[ãa]o compar[ae] com financiamento/i);
	});

	it("SPECIALIST_BASE_PROMPT não tem diretiva 'Nao compara consorcio com financiamento'", () => {
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(
			/n[ãa]o compar[ae] cons[óo]rcio com financiamento/i,
		);
	});

	it("SYSTEM_PROMPT instrui a usar tool compare_with_financing", () => {
		expect(SYSTEM_PROMPT).toMatch(/compare_with_financing/);
	});

	it("SPECIALIST_BASE_PROMPT instrui a usar tool compare_with_financing", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/compare_with_financing/);
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

describe("Plano consolidado v2 — Bv2-06/-07/-08 anti-regressão prompt", () => {
	// CRÍTICO: o specialist (Helena/Rafael/Bruno/Camila) recebe SOMENTE
	// SPECIALIST_BASE_PROMPT em runtime (via buildSpecialistPrompt). Regras
	// regulatórias DEVEM estar nele — falso positivo round 2: testar
	// COMBINED escondeu que linha 251 instruía o oposto.

	it("Bv2-07: SPECIALIST_BASE_PROMPT instrui encadeamento recommendation → simulation", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/present_simulation_result/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/present_recommendation_card/);
	});

	it("Bv2-08: SPECIALIST_BASE_PROMPT obriga creditValue NOMINAL do grupo", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/creditValue\s+NOMINAL\s+DO\s+GRUPO/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/creditAdjustmentNotice/);
	});

	it("Bv2-08: SPECIALIST_BASE_PROMPT menciona CDC 30/35/37", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/CDC.*30.*35.*37/);
	});

	it("Bv2-06: SPECIALIST_BASE_PROMPT PROÍBE arredondar valores monetários na fala", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/NUNCA\s+arredonde/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/literal/i);
	});

	it("Bv2-06: SPECIALIST_BASE_PROMPT NÃO INSTRUI arredondar (anti-regressão linha 251 round 2)", () => {
		// O bug: linha 251 instruía "arredonde pra múltiplos de R$ 100".
		// Specialist é o único que recebe esse prompt em runtime.
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/arredonde\s+pra\s+m[úu]ltiplos/i);
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/arredonde\s+para\s+m[úu]ltiplos/i);
	});

	it("Bv2-06: SPECIALIST_BASE_PROMPT VETA 'taxa dentro da média do mercado'", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/taxa\s+dentro\s+da\s+m[ée]dia/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/(VETADO|PROIBIDO|NUNCA|nao\s+escreva).*taxa\s+dentro\s+da\s+m[ée]dia|taxa\s+dentro\s+da\s+m[ée]dia.*(VETADO|PROIBIDO|NUNCA|sem fonte)/is,
		);
	});
});
