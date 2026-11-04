import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	BASE_DO_VENDEDOR,
	compor,
	ORDEM_DE_COMPOSICAO,
	PARTES_NA_TELA,
	PARTES_PADRAO,
	PROMPT_DO_VENDEDOR,
} from "./prompt-do-vendedor";

// O legado foi extraído do HEAD antes da repartição (59b98e24). É a lei: a repartição em
// partes não pode mudar um byte do que o modelo recebe.
const legado = readFileSync(join(__dirname, "__fixtures__/prompt-do-vendedor.legado.txt"), "utf8");

describe("repartição do prompt em partes (comportamento idêntico ao legado)", () => {
	it("T1.1 PROMPT_DO_VENDEDOR é idêntico ao legado", () => {
		expect(PROMPT_DO_VENDEDOR).toBe(legado);
	});

	it("T1.2 compor(PARTES_PADRAO) é idêntico ao legado", () => {
		expect(compor(PARTES_PADRAO)).toBe(legado);
	});

	it("T1.3 as 7 partes existem e as duas ordens têm o mesmo conjunto", () => {
		const chaves = Object.keys(PARTES_PADRAO).sort();
		expect(chaves).toHaveLength(7);
		expect([...PARTES_NA_TELA].sort()).toEqual(chaves);
		expect([...ORDEM_DE_COMPOSICAO].sort()).toEqual(chaves);
		for (const texto of Object.values(PARTES_PADRAO)) expect(texto.length).toBeGreaterThan(0);
	});

	it("T1.4 o legado tem 27 blocos e base + partes os reproduz na ordem", () => {
		// 28 parágrafos de leitura; os dois primeiros da abertura ("A primeira coisa é o nome" e
		// "Se o nome ainda falta") não têm linha em branco entre si, então são um bloco.
		const blocos = legado.split("\n\n");
		expect(blocos).toHaveLength(27);
		const remontado = [
			BASE_DO_VENDEDOR.prefixo,
			...ORDEM_DE_COMPOSICAO.map((id) => PARTES_PADRAO[id]),
			BASE_DO_VENDEDOR.sufixo,
		].join("\n\n");
		expect(remontado.split("\n\n")).toEqual(blocos);
	});

	it("T1.5 trocar uma parte altera só o trecho dela", () => {
		const trocado = compor({ ...PARTES_PADRAO, abertura: "X" });
		expect(trocado).not.toBe(legado);
		expect(trocado).toContain("X");
		expect(trocado).not.toContain(PARTES_PADRAO.abertura);
		for (const id of ORDEM_DE_COMPOSICAO) {
			if (id !== "abertura") expect(trocado).toContain(PARTES_PADRAO[id]);
		}
		expect(trocado).toBe(legado.replace(PARTES_PADRAO.abertura, "X"));
	});
});
