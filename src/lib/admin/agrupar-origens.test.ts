// O painel precisa responder "quanto o Instagram trouxe?" — e não conseguia.
//
// A tabela mostrava uma linha por campanha, nomeada com o rótulo cru da Meta
// (`ig · 120250956902860104 · 120250989573330104`). Na tela real de 14/08 eram
// quinze linhas assim, todas zeradas menos a primeira, e a soma do canal não
// existia em lugar nenhum.
import { describe, expect, it } from "vitest";
import { abreviarId, agruparPorCanal, nomeDaFonte, rotuloDaCampanha } from "./agrupar-origens";
import type { LinhaOrigem } from "./performance-types";

function campanha(
	fonte: string,
	campanhaId: string,
	criativoId: string,
	numeros: Partial<LinhaOrigem> = {},
): LinhaOrigem {
	return {
		origem: {
			tipo: "campanha",
			fonte,
			campanha: campanhaId,
			criativo: criativoId,
			label: [fonte, campanhaId, criativoId].join(" · "),
		},
		visitas: 0,
		conversas: 0,
		identificados: 0,
		propostas: 0,
		fechados: 0,
		taxaFechamento: 0,
		...numeros,
	};
}

const DIRETO: LinhaOrigem = {
	origem: { tipo: "direto", fonte: null, campanha: null, criativo: null, label: "Direto" },
	visitas: 28_621,
	conversas: 15,
	identificados: 7,
	propostas: 4,
	fechados: 0,
	taxaFechamento: 0,
};

describe("nomeDaFonte", () => {
	it("traduz o apelido que o anunciante digita", () => {
		expect(nomeDaFonte("ig")).toBe("Instagram");
		expect(nomeDaFonte("FB")).toBe("Facebook");
		expect(nomeDaFonte("google")).toBe("Google");
	});

	it("fonte desconhecida vira Título, não 'Outros'", () => {
		// O time reconhece o que ele mesmo digitou na UTM.
		expect(nomeDaFonte("taboola")).toBe("Taboola");
	});

	it("sem fonte, é Outros", () => {
		expect(nomeDaFonte(null)).toBe("Outros");
	});
});

describe("abreviarId", () => {
	it("corta o ID da Meta pelo sufixo, que é o que diferencia", () => {
		expect(abreviarId("120250956902860104")).toBe("…860104");
	});

	it("nome escolhido por gente fica inteiro, por mais longo que seja", () => {
		// Abreviar aqui destruiria a única informação legível da linha.
		expect(abreviarId("verao2026")).toBe("verao2026");
		expect(abreviarId("remarketing-agosto-carro")).toBe("remarketing-agosto-carro");
	});

	it("ID curto não é mexido", () => {
		expect(abreviarId("12345")).toBe("12345");
	});
});

describe("rotuloDaCampanha", () => {
	it("não repete a fonte dentro do canal dela", () => {
		const r = rotuloDaCampanha(campanha("ig", "120250956902860104", "120250989573330104").origem);
		expect(r).toBe("campanha …860104 · criativo …330104");
		expect(r).not.toContain("ig");
	});

	it("sem campanha nem criativo, cai no rótulo original", () => {
		expect(
			rotuloDaCampanha({
				tipo: "referencia",
				fonte: "ajagora.com.br",
				campanha: null,
				criativo: null,
				label: "ajagora.com.br",
			}),
		).toBe("ajagora.com.br");
	});
});

describe("agruparPorCanal", () => {
	const origens: LinhaOrigem[] = [
		DIRETO,
		campanha("ig", "120250956902860104", "120250989573330104", { visitas: 547 }),
		campanha("ig", "120250998207680104", "120250998207800104", { visitas: 201 }),
		campanha("ig", "120250956902860104", "120250997008800104", {
			visitas: 140,
			conversas: 2,
			fechados: 1,
		}),
		{
			origem: {
				tipo: "referencia",
				fonte: "ajagora.com.br",
				campanha: null,
				criativo: null,
				label: "ajagora.com.br",
			},
			visitas: 69,
			conversas: 0,
			identificados: 0,
			propostas: 0,
			fechados: 0,
			taxaFechamento: 0,
		},
	];

	it("soma as campanhas do mesmo canal numa linha só", () => {
		const grupos = agruparPorCanal(origens);
		const instagram = grupos.find((g) => g.nome === "Instagram");

		expect(instagram?.visitas).toBe(888); // 547 + 201 + 140
		expect(instagram?.conversas).toBe(2);
		expect(instagram?.fechados).toBe(1);
		expect(instagram?.detalhe).toHaveLength(3);
	});

	it("ordena os canais por visitas — o maior primeiro", () => {
		const grupos = agruparPorCanal(origens);
		expect(grupos.map((g) => g.nome)).toEqual(["Direto", "Instagram", "Referência"]);
	});

	it("dentro do canal, quem FECHOU vem antes de quem só trouxe visita", () => {
		const instagram = agruparPorCanal(origens).find((g) => g.nome === "Instagram");
		// A campanha de 140 visitas fechou 1; a de 547 não fechou nada.
		expect(instagram?.detalhe[0].visitas).toBe(140);
		expect(instagram?.detalhe[0].fechados).toBe(1);
	});

	it("calcula a taxa sobre o total do canal, não sobre a soma das taxas", () => {
		const instagram = agruparPorCanal(origens).find((g) => g.nome === "Instagram");
		// 1 fechado ÷ 888 visitas = 0,1126%
		expect(instagram?.taxaFechamento).toBeCloseTo(0.1126, 3);
	});

	it("canal sem visita nenhuma não divide por zero", () => {
		const zerado = agruparPorCanal([campanha("ig", "c1", "cr1")]);
		expect(zerado[0].taxaFechamento).toBe(0);
	});

	it("lista vazia devolve lista vazia", () => {
		expect(agruparPorCanal([])).toEqual([]);
	});
});
