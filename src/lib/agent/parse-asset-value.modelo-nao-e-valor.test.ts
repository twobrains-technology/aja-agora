// Produção, 2026-08 — o cliente respondeu o MODELO da moto ("CG 160") no turno
// do valor e o funil gravou `creditMentionedAtDesire: 160000`. Dali pra frente
// a busca inteira rodou na faixa errada: uma carta de R$ 160 mil pra quem quer
// uma moto de ~R$ 18 mil.
//
// A proteção que existia (FIX-208) cobria só o número COLADO à letra — "rav4"
// não vira R$ 4 mil porque o `4` é precedido de letra. Com espaço no meio
// ("CG 160", "Onix 100", "Ninja 400") a âncora não pega, e a tolerância de "até
// 4 palavras" deixava "quero uma cg 160" passar inteiro.
//
// A correção troca blocklist por ALLOWLIST (Lei 2 da arquitetura de agente): em
// vez de tentar enumerar os modelos de veículo do mundo — lista infinita que
// envelhece —, o número nu só vira valor quando TODAS as outras palavras da
// mensagem são muletas conhecidas de quem está dizendo um preço ("uns", "por
// volta de", "acho que"). Palavra desconhecida ao lado do número = ambíguo =
// null, que é o comportamento seguro: o gate `credit` continua pendente e o
// agente pergunta de novo.

import { describe, expect, it } from "vitest";
import { parseAssetValue } from "@/lib/agent/parse-asset-value";

const noGateDeValor = { gate: "credit" as const, category: "auto" as const };
const noGateDeValorMoto = { gate: "credit" as const, category: "moto" as const };

describe("nome de modelo não vira valor do bem", () => {
	it("'CG 160' não vira R$ 160 mil — foi o caso real que quebrou a busca", () => {
		expect(parseAssetValue("CG 160", noGateDeValorMoto)).toBeNull();
		expect(parseAssetValue("quero uma cg 160", noGateDeValorMoto)).toBeNull();
	});

	it("modelo com número separado por espaço, em qualquer categoria", () => {
		for (const t of ["Onix 100", "Ninja 400", "Corolla 2020", "uma biz 125", "civic 2 0"]) {
			expect(parseAssetValue(t, noGateDeValor), t).toBeNull();
		}
	});

	it("número nu continua virando valor quando a mensagem é só o número", () => {
		expect(parseAssetValue("200", noGateDeValor)).toBe(200_000);
		expect(parseAssetValue("80", noGateDeValor)).toBe(80_000);
	});

	it("muleta comum de quem diz preço continua funcionando", () => {
		expect(parseAssetValue("uns 200", noGateDeValor)).toBe(200_000);
		expect(parseAssetValue("acho que 200", noGateDeValor)).toBe(200_000);
		expect(parseAssetValue("por volta de 250", noGateDeValor)).toBe(250_000);
		expect(parseAssetValue("mais ou menos 90", noGateDeValor)).toBe(90_000);
		expect(parseAssetValue("uns 200 reais", noGateDeValor)).toBe(200_000);
	});

	it("valor com marcador explícito não depende da allowlist — o marcador já ancora", () => {
		expect(parseAssetValue("uma cg 160 de 18 mil", noGateDeValorMoto)).toBe(18_000);
		expect(parseAssetValue("o onix custa R$ 90.000", noGateDeValor)).toBe(90_000);
	});
});
