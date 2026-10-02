// D6 (FIX-435) — o sinal determinístico do analyzer fora do ar.
//
// O que faltava não era o fallback (ele sempre existiu) e sim a MEDIÇÃO dele.
// Em 01/10 a produção levou 29× HTTP 400 "Your credit balance is too low" entre
// 10:50 e 11:52 e nenhum painel mostrou nada: o turno saiu com `userIntent:
// "neutral"`, que é indistinguível de um turno em que o cliente não deu sinal
// nenhum. As duas sessões do episódio (`0e5d777a`, `8b64899b`) só apareceram
// quando alguém leu CloudWatch linha a linha.
//
// O score vai no MESMO trace do `conducao_entregue` e é emitido em TODO turno de
// cliente — como 0 também. Score que só aparece quando vale 1 não tem
// denominador: a média no Langfuse viraria 1,0 para sempre e o sinal mediria a
// si mesmo (o mesmo vício que `carta_na_tela` documenta).
import { describe, expect, it } from "vitest";
import { scoresDeAnalisador } from "./analisador-scores";

describe("analisador_indisponivel", () => {
	it("marca 1 no turno em que o analyzer caiu no fallback", () => {
		expect(scoresDeAnalisador(true)).toEqual([
			{ name: "analisador_indisponivel", value: 1, dataType: "BOOLEAN" },
		]);
	});

	it("marca 0 no turno normal — o denominador existe", () => {
		expect(scoresDeAnalisador(false)).toEqual([
			{ name: "analisador_indisponivel", value: 0, dataType: "BOOLEAN" },
		]);
	});
});
