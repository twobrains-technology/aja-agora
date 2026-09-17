// A tela de campanhas — o cruzamento entre o funil do CRM e o gasto da Meta.
//
// Teste PURO: o SQL só busca, e a decisão (juntar as duas listas, calcular custo
// por qualificado, ordenar) mora em `combinarCampanhas`/`totalizarCampanhas`.
// Testar isso sem banco é o que permite afirmar as duas coisas que a tela não
// pode errar:
//
//   1. **agrupa por campanha** — uma linha por campanha, com funil e gasto juntos;
//   2. **campanha sem nome resolvido ainda aparece** — o resolvedor não conhecer
//      a campanha não é motivo para sumir com ela da tela.

import { describe, expect, it } from "vitest";
import {
	combinarCampanhas,
	type GastoDeCampanha,
	type LinhaFunilCampanha,
	totalizarCampanhas,
} from "./campanhas-queries";

function funil(parcial: Partial<LinhaFunilCampanha> & { chave: string }): LinhaFunilCampanha {
	return {
		utmCampaign: null,
		visitas: 0,
		conversas: 0,
		identificados: 0,
		qualificados: 0,
		propostas: 0,
		fechados: 0,
		...parcial,
	};
}

function gasto(parcial: Partial<GastoDeCampanha> & { entityId: string }): GastoDeCampanha {
	return {
		nome: null,
		status: null,
		spendCents: 0,
		impressoes: 0,
		cliques: 0,
		leadsMeta: 0,
		...parcial,
	};
}

describe("combinarCampanhas", () => {
	it("agrupa por campanha, juntando funil do CRM e gasto da Meta", () => {
		const linhas = combinarCampanhas(
			[
				funil({
					chave: "120250956902860104",
					visitas: 547,
					conversas: 12,
					identificados: 8,
					qualificados: 4,
					propostas: 2,
					fechados: 1,
				}),
				funil({ chave: "120250998207680104", visitas: 201, conversas: 3, identificados: 3 }),
			],
			[
				gasto({
					entityId: "120250956902860104",
					nome: "META | EXP | LEAD | BR | PLACEMENTS",
					status: "ACTIVE",
					spendCents: 120_000,
					leadsMeta: 15,
				}),
				gasto({
					entityId: "120250998207680104",
					nome: "TOFU - AJA | INTERESSES CARROS",
					spendCents: 90_000,
					leadsMeta: 5,
				}),
			],
		);

		expect(linhas).toHaveLength(2);

		const primeira = linhas[0];
		expect(primeira.nome).toBe("META | EXP | LEAD | BR | PLACEMENTS");
		expect(primeira.nomeResolvido).toBe(true);
		expect(primeira.entityId).toBe("120250956902860104");
		expect(primeira.spendCents).toBe(120_000);
		expect(primeira.leadsMeta).toBe(15);
		expect(primeira.identificados).toBe(8);
		// 120000 centavos ÷ 4 qualificados = 30000 centavos por qualificado.
		expect(primeira.custoPorQualificadoCents).toBe(30_000);
	});

	it("campanha sem nome resolvido ainda aparece — com a UTM como rótulo", () => {
		const linhas = combinarCampanhas(
			[
				funil({
					chave: "consorcio-agosto",
					utmCampaign: "consorcio-agosto",
					visitas: 40,
					conversas: 2,
				}),
			],
			[],
		);

		expect(linhas).toHaveLength(1);
		expect(linhas[0].nome).toBe("consorcio-agosto");
		expect(linhas[0].nomeResolvido).toBe(false);
		expect(linhas[0].entityId).toBeNull();
		// Sem gasto conhecido, o custo é "sem base" — nunca zero.
		expect(linhas[0].custoPorQualificadoCents).toBeNull();
	});

	it("campanha sem UTM conhecida cai no id abreviado, e não some", () => {
		const linhas = combinarCampanhas([funil({ chave: "120250956902860104" })], []);
		expect(linhas[0].nome).toBe("…860104");
		expect(linhas[0].nomeResolvido).toBe(false);
	});

	it("campanha que gastou e não trouxe ninguém aparece — com o dinheiro visível", () => {
		const linhas = combinarCampanhas(
			[],
			[gasto({ entityId: "999", nome: "CAMPANHA QUEIMADA", spendCents: 50_000, leadsMeta: 9 })],
		);

		expect(linhas).toHaveLength(1);
		expect(linhas[0].spendCents).toBe(50_000);
		expect(linhas[0].conversas).toBe(0);
		expect(linhas[0].qualificados).toBe(0);
		expect(linhas[0].custoPorQualificadoCents).toBeNull();
		expect(linhas[0].diferencaDeLeads).toBe(9);
	});

	it("nomeia a diferença entre o que a Meta atribuiu e o que o CRM contou", () => {
		const linhas = combinarCampanhas(
			[funil({ chave: "c1", identificados: 3 })],
			[gasto({ entityId: "c1", nome: "Campanha 1", spendCents: 10_000, leadsMeta: 7 })],
		);
		expect(linhas[0].diferencaDeLeads).toBe(4);
	});

	it("ordena por custo por lead qualificado — o mais caro primeiro", () => {
		const linhas = combinarCampanhas(
			[funil({ chave: "barata", qualificados: 10 }), funil({ chave: "cara", qualificados: 1 })],
			[
				gasto({ entityId: "barata", nome: "Barata", spendCents: 100_000, leadsMeta: 10 }),
				gasto({ entityId: "cara", nome: "Cara", spendCents: 100_000, leadsMeta: 10 }),
			],
		);
		// A cara custa 100000/1 = 100000; a barata, 10000.
		expect(linhas.map((l) => l.nome)).toEqual(["Barata", "Cara"]);
		expect(linhas[0].custoPorQualificadoCents).toBe(10_000);
	});

	it("sem qualificado vai para o fim, mas o maior gasto vem antes entre eles", () => {
		const linhas = combinarCampanhas(
			[
				funil({ chave: "com-qualificado", qualificados: 2 }),
				funil({ chave: "sem-qualificado", qualificados: 0 }),
			],
			[
				gasto({ entityId: "com-qualificado", nome: "Com qualificado", spendCents: 100_000 }),
				gasto({ entityId: "sem-qualificado", nome: "Sem qualificado", spendCents: 80_000 }),
				gasto({ entityId: "queimou-tudo", nome: "Queimou tudo", spendCents: 200_000 }),
			],
		);
		// A "sem qualificado" tem funil (não qualificou); a "queimou tudo" só gastou.
		// Entre as duas sem custo, o maior investimento primeiro.
		expect(linhas[linhas.length - 2].nome).toBe("Queimou tudo");
		expect(linhas[linhas.length - 1].nome).toBe("Sem qualificado");
		expect(linhas[0].nome).toBe("Com qualificado");
	});
});

describe("totalizarCampanhas", () => {
	it("soma investimento e funil, e calcula o custo médio sobre o total", () => {
		const linhas = combinarCampanhas(
			[
				funil({ chave: "a", identificados: 4, qualificados: 2, propostas: 1, fechados: 1 }),
				funil({ chave: "b", identificados: 6, qualificados: 3 }),
			],
			[
				gasto({ entityId: "a", nome: "A", spendCents: 60_000, leadsMeta: 10 }),
				gasto({ entityId: "b", nome: "B", spendCents: 40_000, leadsMeta: 5 }),
			],
		);

		const totais = totalizarCampanhas(linhas);
		expect(totais.investimentoCents).toBe(100_000);
		expect(totais.leadsMeta).toBe(15);
		expect(totais.leadsCrm).toBe(10);
		expect(totais.qualificados).toBe(5);
		expect(totais.propostas).toBe(1);
		expect(totais.fechados).toBe(1);
		// 100000 centavos ÷ 5 qualificados = 20000.
		expect(totais.custoPorQualificadoCents).toBe(20_000);
	});

	it("lista vazia não divide por zero", () => {
		const totais = totalizarCampanhas([]);
		expect(totais.custoPorQualificadoCents).toBeNull();
		expect(totais.investimentoCents).toBe(0);
	});
});
