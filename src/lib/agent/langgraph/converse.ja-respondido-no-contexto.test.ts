// L4 — O CONTEXTO DO TURNO DEVOLVE O QUE JÁ FOI RESPONDIDO.
//
// Medido em produção (21/09/2026): o cliente já tinha dito o carro e, ao mandar
// um "Oi", o agente reabriu a qualificação ("que carro você tem em mente?"). As
// respostas estavam no funil (`desireAnswered`, `currentCategory`,
// `qualifyAnswers`) e nunca chegavam ao modelo como FATO.
//
// Testado na função pura de propósito: o bloco é montado a partir do estado, e
// o que importa é que cada fato RESPONDIDO vire linha — e que bloco vazio não
// injete nada no system (senão todo turno ganha um "nada foi respondido").
import { describe, expect, it } from "vitest";
import { blocoDoJaRespondido } from "./nodes/converse";

describe("L4 — bloco do que já foi respondido", () => {
	it("leva bem, categoria, valor, prazo e lance para o contexto", () => {
		const bloco = blocoDoJaRespondido({
			categoria: "auto",
			desiredItem: "Corolla",
			valorDoBem: 200_000,
			prazoMeses: 116,
			lance: "yes",
			lanceValue: 20_000,
		});
		expect(bloco).toBeTruthy();
		expect(bloco).toContain("Corolla");
		expect(bloco).toContain("auto");
		expect(bloco).toContain("R$ 200.000");
		expect(bloco).toContain("116 meses");
		expect(bloco).toContain("lance");
		expect(bloco).toMatch(/NÃO as faça de novo/);
	});

	it("sem nada respondido → nenhum bloco (não injeta system vazio)", () => {
		expect(blocoDoJaRespondido({})).toBeNull();
	});

	it("recusa de lance é fato: não perguntar de novo", () => {
		const bloco = blocoDoJaRespondido({ lance: "no" });
		expect(bloco).toContain("NÃO quer comprometer");
	});
});
