// O REGISTRO de experimentos, sem banco.
//
// O que este arquivo protege é a generalização (D4): o parse do recorte e o
// rótulo não conhecem o teste do telefone — recebem o REGISTRO. O teste do
// experimento fictício é a prova: ele entra no parse e no rótulo sem que uma
// linha deste módulo saiba que ele existe.

import { describe, expect, it } from "vitest";
import {
	COOKIE_DO_RECORTE_AB,
	EXPERIMENTOS,
	type Experimento,
	lerRecorteAB,
	PARAMETRO_DO_RECORTE_AB,
	rotuloDoRecorte,
	SEM_BRACO,
	serializarRecorteAB,
} from "./registro";

const FICTICIO: Experimento = {
	id: "precoNaTela",
	rotulo: "Teste do preço",
	bracos: ["1", "2"],
	rotulosDosBracos: { "1": "1 — preço cheio", "2": "2 — preço com desconto" },
	etapaAncora: "com_contato",
};

const COM_FICTICIO: readonly Experimento[] = [...EXPERIMENTOS, FICTICIO];

describe("EXPERIMENTOS — o registro vivo", () => {
	it("tem o teste do telefone, ancorado na identificação", () => {
		expect(EXPERIMENTOS).toHaveLength(1);
		const tele = EXPERIMENTOS[0];
		expect(tele?.id).toBe("telefoneDoDesbloqueio");
		expect(tele?.rotulo).toBe("Teste do telefone");
		expect(tele?.bracos).toEqual(["A", "B"]);
		expect(tele?.etapaAncora).toBe("identificados");
	});

	it("os rótulos dos braços são texto visível, com acento e travessão", () => {
		expect(EXPERIMENTOS[0]?.rotulosDosBracos).toEqual({
			A: "A — telefone antes das ofertas",
			B: "B — ofertas embaçadas",
		});
	});

	it("o balde e os nomes de transporte são os combinados", () => {
		expect(SEM_BRACO).toBe("sem-variante");
		expect(COOKIE_DO_RECORTE_AB).toBe("aja_ab");
		expect(PARAMETRO_DO_RECORTE_AB).toBe("ab");
	});
});

describe("lerRecorteAB — allowlist por experimento", () => {
	it("aceita braço válido e o balde sem variante", () => {
		expect(lerRecorteAB("telefoneDoDesbloqueio:A")).toEqual([
			{ experimento: "telefoneDoDesbloqueio", braco: "A" },
		]);
		expect(lerRecorteAB("telefoneDoDesbloqueio:B")).toEqual([
			{ experimento: "telefoneDoDesbloqueio", braco: "B" },
		]);
		expect(lerRecorteAB("telefoneDoDesbloqueio:sem-variante")).toEqual([
			{ experimento: "telefoneDoDesbloqueio", braco: "sem-variante" },
		]);
	});

	it("recusa braço fora da lista do experimento", () => {
		expect(lerRecorteAB("telefoneDoDesbloqueio:C")).toEqual([]);
		expect(lerRecorteAB("telefoneDoDesbloqueio:a")).toEqual([]);
	});

	it("recusa experimento desconhecido", () => {
		expect(lerRecorteAB("precoNaTela:1")).toEqual([]);
	});

	it("nunca lança com lixo — e lixo vira 'todas'", () => {
		const vazios = [null, undefined, 123, {}, [], "", "   ", "lixo", "telefoneDoDesbloqueio", ":A"];
		for (const lixo of vazios) {
			expect(lerRecorteAB(lixo)).toEqual([]);
		}
		// `:A` sem experimento, braço vazio e vírgula sobrando não lançam.
		for (const torto of [
			"telefoneDoDesbloqueio:",
			"telefoneDoDesbloqueio:A,",
			"telefoneDoDesbloqueio:A,B",
		]) {
			expect(() => lerRecorteAB(torto)).not.toThrow();
		}
		expect(lerRecorteAB("telefoneDoDesbloqueio:A,")).toEqual([
			{ experimento: "telefoneDoDesbloqueio", braco: "A" },
		]);
	});

	it("descarta o par inválido e mantém o válido da mesma string", () => {
		expect(lerRecorteAB("inventado:Z,telefoneDoDesbloqueio:A")).toEqual([
			{ experimento: "telefoneDoDesbloqueio", braco: "A" },
		]);
	});

	it("um experimento por vez: o segundo par do mesmo teste é ignorado", () => {
		expect(lerRecorteAB("telefoneDoDesbloqueio:A,telefoneDoDesbloqueio:B")).toEqual([
			{ experimento: "telefoneDoDesbloqueio", braco: "A" },
		]);
	});

	it("o experimento FICTÍCIO entra no parse sem tocar em código (D4)", () => {
		expect(lerRecorteAB("precoNaTela:2", COM_FICTICIO)).toEqual([
			{ experimento: "precoNaTela", braco: "2" },
		]);
		expect(lerRecorteAB("precoNaTela:3", COM_FICTICIO)).toEqual([]);
	});
});

describe("serializarRecorteAB — ida e volta", () => {
	it("recorte vazio vira null (o parâmetro some da URL)", () => {
		expect(serializarRecorteAB([])).toBeNull();
	});

	it("serializa e volta ao mesmo recorte", () => {
		const recorte = lerRecorteAB("telefoneDoDesbloqueio:A");
		expect(serializarRecorteAB(recorte)).toBe("telefoneDoDesbloqueio:A");
		expect(lerRecorteAB(serializarRecorteAB(recorte))).toEqual(recorte);
	});

	it("com dois experimentos, preserva a ordem", () => {
		const recorte = lerRecorteAB("telefoneDoDesbloqueio:A,precoNaTela:1", COM_FICTICIO);
		expect(serializarRecorteAB(recorte)).toBe("telefoneDoDesbloqueio:A,precoNaTela:1");
	});
});

describe("rotuloDoRecorte — texto, nunca só cor", () => {
	it("sem recorte não escreve nada", () => {
		expect(rotuloDoRecorte([])).toBeNull();
	});

	it("nomeia o teste e o braço", () => {
		expect(rotuloDoRecorte(lerRecorteAB("telefoneDoDesbloqueio:A"))).toBe(
			"Recorte: Teste do telefone · braço A",
		);
		expect(rotuloDoRecorte(lerRecorteAB("telefoneDoDesbloqueio:B"))).toBe(
			"Recorte: Teste do telefone · braço B",
		);
		expect(rotuloDoRecorte(lerRecorteAB("telefoneDoDesbloqueio:sem-variante"))).toBe(
			"Recorte: Teste do telefone · sem variante",
		);
	});

	it("o experimento fictício ganha rótulo próprio sem tocar em código (D4)", () => {
		expect(rotuloDoRecorte(lerRecorteAB("precoNaTela:1", COM_FICTICIO), COM_FICTICIO)).toBe(
			"Recorte: Teste do preço · braço 1",
		);
	});
});
