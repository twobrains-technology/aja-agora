import { type SQL, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** O `db` de verdade abriria conexão — aqui o que interessa é o SQL que a query
 * MONTA, e ele nasce antes de qualquer linha voltar. Sem o mock, a garantia só
 * existiria num banco migrado. */
const sqls: SQL[] = [];

vi.mock("@/db", () => ({
	db: {
		execute: async (query: SQL) => {
			sqls.push(query);
			return { rows: [] };
		},
	},
}));

const { FONTES_DOS_CUSTOS, computeFunilMidia, computeQuemChegou, valorDeclaradoDaConversa } =
	await import("./performance-queries");
const { viuOferta } = await import("./sinais-do-funil");

/** Ver `sinais-do-funil.test.ts`: o texto do `SQL` mora em `queryChunks`. */
function texto(c: unknown): string {
	if (typeof c === "string") return c;
	if (c && typeof c === "object" && "queryChunks" in c) {
		return (c as SQL).queryChunks.map(texto).join("");
	}
	if (c && typeof c === "object" && "value" in c) return String((c as { value: unknown }).value);
	return "";
}

const DE = new Date("2026-10-01T03:00:00.000Z");
const ATE = new Date("2026-10-01T23:59:59.000Z");

beforeEach(() => {
	sqls.length = 0;
});

describe("Performance · 'Viram oferta' — a fonte é a mesma do Percurso", () => {
	// L28/N01 — o port de a2bc3024 trocou o predicado compartilhado e deixou o
	// agregado da Performance com o JOIN antigo em `artifacts`. Resultado: a
	// oferta retida era descontada no degrau e contada no total da mesma tela.
	it("o total do funil carrega o predicado único, com a retenção negada", async () => {
		await computeFunilMidia(DE, ATE);
		const query = texto(sqls[0]);
		expect(query).toContain(texto(viuOferta(sql`c`)));
	});

	it("não sobra JOIN solto em artifacts no agregado do funil", async () => {
		await computeFunilMidia(DE, ATE);
		// O `EXISTS` de `viuOferta` é o único lugar que pode tocar `artifacts`.
		const ocorrencias = texto(sqls[0]).match(/FROM artifacts/g) ?? [];
		expect(ocorrencias).toHaveLength(0);
	});
});

describe("Performance · perfil de quem chegou", () => {
	// L44 — o valor declarado era lido só de `qualifyAnswers.creditMax`, que o
	// vendedor livre grava na BUSCA. Quem declarou o valor e não chegou a buscar
	// (ou fechou outra carta) caía em "valor não informado".
	it("o valor declarado vem das três gravações do metadata, nesta ordem", () => {
		const q = texto(valorDeclaradoDaConversa(sql`c`));
		expect(q).toContain("COALESCE");
		const busca = q.indexOf("creditMax");
		const bem = q.indexOf("valorDoBemAlvo");
		const fecho = q.indexOf("contractOffer");
		expect(busca).toBeGreaterThanOrEqual(0);
		expect(bem).toBeGreaterThan(busca);
		expect(fecho).toBeGreaterThan(bem);
	});

	it("cada candidato passa pela guarda de número — jsonb é livre", () => {
		const q = texto(valorDeclaradoDaConversa(sql`c`));
		const guardas = q.match(/::numeric/g) ?? [];
		expect(guardas).toHaveLength(3);
	});

	it("a query do perfil usa o fragmento único", async () => {
		await computeQuemChegou(DE, ATE);
		expect(texto(sqls[0])).toContain(texto(valorDeclaradoDaConversa(sql`c`)));
	});

	it("o bem continua vindo de `currentCategory`, a chave que o vendedor grava", async () => {
		await computeQuemChegou(DE, ATE);
		expect(texto(sqls[0])).toContain("currentCategory");
	});
});

describe("Performance · fontes declaradas do custo", () => {
	// L43 — a tela declarava "Langfuse" para o custo de IA desde 19/10/2026, quando
	// a leitura passou a ser o livro-caixa local `uso_de_ia`.
	it("o custo de IA é declarado na fonte que o código lê", () => {
		expect(FONTES_DOS_CUSTOS.custoDeIA).toContain("uso_de_ia");
		expect(FONTES_DOS_CUSTOS.custoDeIA.toLowerCase()).not.toContain("langfuse");
	});
});
