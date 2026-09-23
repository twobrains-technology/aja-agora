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
	type CustoPorQualificado,
	combinarCampanhas,
	type GastoDeCampanha,
	type LinhaCampanha,
	type LinhaCriativo,
	type LinhaFunilCampanha,
	totalizarCampanhas,
} from "./campanhas-queries";

/** O valor, quando há; `null` quando o custo não pode ser calculado. */
function centavos(c: CustoPorQualificado): number | null {
	return c.tipo === "valor" ? c.centavos : null;
}

function motivo(c: CustoPorQualificado): string | null {
	return c.tipo === "motivo" ? c.motivo : null;
}

/** O custo da linha `chave` — falha alto se ela não existir, em vez de `!`. */
function custoDe(linhas: LinhaCampanha[], chave: string): CustoPorQualificado {
	const linha = linhas.find((l) => l.chave === chave);
	if (!linha) throw new Error(`linha ${chave} ausente`);
	return linha.custoPorQualificado;
}

function funil(parcial: Partial<LinhaFunilCampanha> & { chave: string }): LinhaFunilCampanha {
	return {
		utmCampaign: null,
		visitas: 0,
		conversas: 0,
		identificados: 0,
		comTelefone: 0,
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
		expect(primeira.custoPorQualificado).toEqual({ tipo: "valor", centavos: 30_000 });
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
		// Sem gasto conhecido, o custo não é zero: é "sem gasto informado".
		expect(linhas[0].custoPorQualificado).toEqual({ tipo: "motivo", motivo: "sem_gasto" });
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
		// Gastou, mas nenhuma visita/conversa do CRM aponta para ela.
		expect(linhas[0].custoPorQualificado).toEqual({ tipo: "motivo", motivo: "sem_vinculo" });
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
		expect(centavos(linhas[0].custoPorQualificado)).toBe(10_000);
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

	it("distingue os três motivos de 'sem base'", () => {
		const linhas = combinarCampanhas(
			[
				// Tem vínculo (visitas) e gasto, mas nenhum qualificado.
				funil({ chave: "c1", visitas: 30, qualificados: 0 }),
				// Tem vínculo, mas o gerenciador não reportou gasto.
				funil({ chave: "c2", visitas: 10, qualificados: 0 }),
			],
			[
				gasto({ entityId: "c1", nome: "Gastou sem qualificar", spendCents: 50_000 }),
				gasto({ entityId: "c3", nome: "Sem vínculo", spendCents: 70_000 }),
			],
		);

		expect(motivo(custoDe(linhas, "c1"))).toBe("sem_qualificado");
		expect(motivo(custoDe(linhas, "c2"))).toBe("sem_gasto");
		expect(motivo(custoDe(linhas, "c3"))).toBe("sem_vinculo");
	});

	it("anexa a linha 'Sem origem conhecida' no fim, sem investimento", () => {
		const linhas = combinarCampanhas(
			[funil({ chave: "c1", visitas: 10, conversas: 3, identificados: 2, qualificados: 1 })],
			[gasto({ entityId: "c1", nome: "Campanha 1", spendCents: 10_000 })],
			{ conversas: 4, identificados: 2, comTelefone: 4 },
		);

		const ultima = linhas[linhas.length - 1];
		expect(ultima.semOrigemConhecida).toBe(true);
		expect(ultima.nome).toBe("Sem origem conhecida");
		expect(ultima.conversas).toBe(4);
		expect(ultima.identificados).toBe(2);
		expect(ultima.spendCents).toBe(0);
		expect(ultima.custoPorQualificado).toEqual({ tipo: "motivo", motivo: "sem_vinculo" });
	});

	it("sem conversa sem origem, nenhuma linha extra é criada", () => {
		const linhas = combinarCampanhas([funil({ chave: "c1", visitas: 1 })], []);
		expect(linhas.some((l) => l.semOrigemConhecida)).toBe(false);
	});

	it("anexa os criativos à campanha pelo mapa, e deixa vazio quando não há", () => {
		const criativos = new Map<string, LinhaCriativo[]>([
			[
				"c1",
				[
					{
						chave: "ad-1",
						nome: "IMG | GERAL | V1",
						nomeResolvido: true,
						thumbnailUrl: "https://scontent.example/t.jpg",
						visitas: 5,
						conversas: 2,
						identificados: 1,
					},
				],
			],
		]);
		const linhas = combinarCampanhas(
			[funil({ chave: "c1", visitas: 5 }), funil({ chave: "c2", visitas: 1 })],
			[],
			undefined,
			criativos,
		);
		expect(linhas.find((l) => l.chave === "c1")?.criativos[0]?.nome).toBe("IMG | GERAL | V1");
		expect(linhas.find((l) => l.chave === "c2")?.criativos).toEqual([]);
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
		// Contato conhecido é MAIOR que identificado por construção: todo
		// identificado tem contato, e quem só chegou pelo WhatsApp tem contato sem
		// ter se identificado. As duas colunas existem para essa diferença ficar
		// visível em vez de virar um número só.
		expect(totais.comTelefone).toBe(0);
		expect(totais.qualificados).toBe(5);
		expect(totais.propostas).toBe(1);
		expect(totais.fechados).toBe(1);
		// 100000 centavos ÷ 5 qualificados = 20000.
		expect(centavos(totais.custoPorQualificado)).toBe(20_000);
		expect(totais.conversas).toBe(0);
	});

	it("lista vazia não divide por zero", () => {
		const totais = totalizarCampanhas([]);
		expect(motivo(totais.custoPorQualificado)).toBe("sem_gasto");
		expect(totais.investimentoCents).toBe(0);
	});

	it("o total de conversas inclui a linha sem origem (reconcilia com Conversas)", () => {
		const linhas = combinarCampanhas(
			[funil({ chave: "a", conversas: 3 }), funil({ chave: "b", conversas: 1 })],
			[],
			{ conversas: 5, identificados: 2, comTelefone: 4 },
		);
		const totais = totalizarCampanhas(linhas);
		expect(totais.conversas).toBe(9);
		expect(totais.leadsCrm).toBe(2);
		expect(totais.comTelefone).toBe(4);
	});

	it("soma o contato conhecido das campanhas, separado do identificado", () => {
		const linhas = combinarCampanhas(
			[
				funil({ chave: "a", identificados: 1, comTelefone: 5 }),
				funil({ chave: "b", identificados: 2, comTelefone: 7 }),
			],
			[],
		);
		const totais = totalizarCampanhas(linhas);
		expect(totais.leadsCrm).toBe(3);
		expect(totais.comTelefone).toBe(12);
	});
});
