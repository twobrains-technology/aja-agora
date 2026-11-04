import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectarPromessaDeContemplacao } from "@/lib/playground/detector-de-promessa";
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

/** Os três trechos do legado que a U2 troca ou amplia; fora deles o texto é idêntico. */
const ANCORA_ATENDIMENTO = legado
	.split("\n\n")
	.find((b) => b.startsWith("Chama gente quando é a hora")) as string;
const ANCORA_CARTAS = trechoDeCartasNoLegado();
const ANCORA_CONTATO = legado
	.split("\n\n")
	.find((b) => b.startsWith("O contato é o que salva a conversa")) as string;

function trechoDeCartasNoLegado(): string {
	const blocos = legado.split("\n\n");
	const ini = blocos.findIndex((b) => b.startsWith("Opção que cabe em um toque"));
	const fim = blocos.findIndex((b) => b.startsWith("Recomenda com convicção"));
	return blocos.slice(ini, fim + 1).join("\n\n");
}

const normaliza = (t: string) => t.replace(/\s+/g, " ");

describe("repartição do prompt em partes (base e partes)", () => {
	it("T2.4 o texto é o legado com exatamente três substituições", () => {
		expect(PROMPT_DO_VENDEDOR).not.toBe(legado);
		expect(PARTES_PADRAO["atendimento-humano"]).not.toBe(ANCORA_ATENDIMENTO);
		expect(PARTES_PADRAO["cartas-e-cards"].startsWith(ANCORA_CARTAS)).toBe(true);
		expect(PARTES_PADRAO.contato.startsWith(ANCORA_CONTATO)).toBe(true);
		const reverso = PROMPT_DO_VENDEDOR.replace(
			PARTES_PADRAO["atendimento-humano"],
			ANCORA_ATENDIMENTO,
		)
			.replace(PARTES_PADRAO["cartas-e-cards"], ANCORA_CARTAS)
			.replace(PARTES_PADRAO.contato, ANCORA_CONTATO);
		expect(reverso).toBe(legado);
	});

	it("T2.1 atendimento-humano cobre a fila", () => {
		const t = normaliza(PARTES_PADRAO["atendimento-humano"]);
		expect(t).toMatch(/pedir (para falar com )?(um )?atendente|pedir para falar com alguém/i);
		expect(t).toMatch(/para se perder|perder a venda/i);
		expect(t).toMatch(/transferir/i);
		expect(t).toMatch(/sem prometer prazo/i);
		expect(t).toMatch(/hora/i);
		expect(t).toMatch(/ninguém atende/i);
		expect(t).toMatch(/madrugada/i);
		expect(t).toMatch(/combin/i);
		expect(t).toMatch(/se cal/i);
		expect(t).toMatch(/não silencia/i);
		expect(t).toMatch(/Dúvida sobre contemplação, lance, taxa ou segurança dos dados é conversa/);
		expect(t).not.toMatch(/(duas|três|2|3) vezes/i);
		expect(t).not.toMatch(/garant\w+ (o )?prazo/i);
	});

	it("T2.2 cartas-e-cards mantém duas a quatro, ids, não repetir e variar a administradora", () => {
		const t = normaliza(PARTES_PADRAO["cartas-e-cards"]);
		expect(t).toMatch(/duas a quatro/);
		expect(t).toMatch(/\bids\b/);
		expect(t).toMatch(/duas cartas iguais|nunca repita (a )?(mesma )?carta/i);
		expect(t).toMatch(/administradora/i);
		expect(t).toMatch(/varie|variar/i);
	});

	it("T2.2b contato manda pedir o celular uma vez, só na proposta, no site", () => {
		const t = normaliza(PARTES_PADRAO.contato);
		expect(t).toMatch(/uma vez/i);
		expect(t).toMatch(/proposta/i);
	});

	it("T2.5 as partes novas passam no detector; só `objecoes` do legado é acusada (Q3)", () => {
		// O legado diz "nunca prometa data de contemplação" e o detector acusa a frase. O servidor
		// aplica o detector só às partes que diferem do padrão, então o padrão não é barrado.
		const acusadas = Object.entries(PARTES_PADRAO)
			.filter(([, texto]) => !detectarPromessaDeContemplacao(texto).ok)
			.map(([id]) => id);
		expect(acusadas).toEqual(["objecoes"]);
	});

	it("T2.6 limite de conduta segue folgado", () => {
		expect(PROMPT_DO_VENDEDOR.length).toBeLessThan(20_000);
	});
});

describe("repartição do prompt em partes (estrutura)", () => {
	it("T1.2 PROMPT_DO_VENDEDOR é compor(PARTES_PADRAO)", () => {
		expect(compor(PARTES_PADRAO)).toBe(PROMPT_DO_VENDEDOR);
	});

	it("T1.3 as 7 partes existem e as duas ordens têm o mesmo conjunto", () => {
		const chaves = Object.keys(PARTES_PADRAO).sort();
		expect(chaves).toHaveLength(7);
		expect([...PARTES_NA_TELA].sort()).toEqual(chaves);
		expect([...ORDEM_DE_COMPOSICAO].sort()).toEqual(chaves);
		for (const texto of Object.values(PARTES_PADRAO)) expect(texto.length).toBeGreaterThan(0);
	});

	it("T1.4 o legado tem 27 blocos e base + partes os reproduz na ordem", () => {
		// Os blocos 3..27 do texto atual: só os três trechos da U2 diferem do legado.
		// 28 parágrafos de leitura; os dois primeiros da abertura ("A primeira coisa é o nome" e
		// "Se o nome ainda falta") não têm linha em branco entre si, então são um bloco.
		const blocos = legado.split("\n\n");
		expect(blocos).toHaveLength(27);
		const remontado = [
			BASE_DO_VENDEDOR.prefixo,
			...ORDEM_DE_COMPOSICAO.map((id) => PARTES_PADRAO[id]),
			BASE_DO_VENDEDOR.sufixo,
		].join("\n\n");
		expect(remontado).toBe(PROMPT_DO_VENDEDOR);
		expect(PROMPT_DO_VENDEDOR.split("\n\n").length).toBeGreaterThanOrEqual(blocos.length);
	});

	it("T1.5 trocar uma parte altera só o trecho dela", () => {
		const trocado = compor({ ...PARTES_PADRAO, abertura: "X" });
		expect(trocado).not.toBe(PROMPT_DO_VENDEDOR);
		expect(trocado).toContain("X");
		expect(trocado).not.toContain(PARTES_PADRAO.abertura);
		for (const id of ORDEM_DE_COMPOSICAO) {
			if (id !== "abertura") expect(trocado).toContain(PARTES_PADRAO[id]);
		}
		expect(trocado).toBe(PROMPT_DO_VENDEDOR.replace(PARTES_PADRAO.abertura, "X"));
	});
});
