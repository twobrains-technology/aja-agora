import { type SQL, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Só o SQL montado interessa: sem o mock, a garantia exigiria banco migrado. */
const sqls: SQL[] = [];

vi.mock("@/db", () => ({
	db: {
		execute: async (query: SQL) => {
			sqls.push(query);
			return { rows: [] };
		},
	},
}));

const { resultadoDoTesteDoTelefone } = await import("./resultado-do-teste-do-telefone");
const { conversaIdentificada, viuOferta } = await import("@/lib/admin/sinais-do-funil");

/** Ver `src/lib/admin/sinais-do-funil.test.ts`: o texto do `SQL` está em `queryChunks`. */
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

describe("teste do telefone — as duas colunas são as do painel", () => {
	// L28/P241 — com `EXISTS` próprio aqui, a oferta retida pela trava contava
	// nesta leitura e não contava no funil/Percurso: dois números para o mesmo fato.
	it("'na comparação' usa o predicado único de 'viu oferta'", async () => {
		await resultadoDoTesteDoTelefone(DE, ATE);
		expect(texto(sqls[0])).toContain(texto(viuOferta(sql`c`)));
	});

	it("'deixou telefone' usa a mesma identificação do funil", async () => {
		await resultadoDoTesteDoTelefone(DE, ATE);
		expect(texto(sqls[0])).toContain(texto(conversaIdentificada(sql`c`)));
	});
});
