/**
 * O dicionário único do bem. O ponto do arquivo é que `auto` (metadata da
 * conversa) e `carro` (objetivo da régua) digam a MESMA palavra na tela — o
 * defeito era "Automóvel" numa coluna e "Carro" na outra.
 */

import { describe, expect, it } from "vitest";
import { chaveCanonicaDoBem, rotuloDoBem } from "./rotulo-do-bem";

describe("rotuloDoBem", () => {
	it("as duas grafias do banco viram 'Carro'", () => {
		expect(rotuloDoBem("auto")).toBe("Carro");
		expect(rotuloDoBem("carro")).toBe("Carro");
	});

	it("moto e imóvel", () => {
		expect(rotuloDoBem("moto")).toBe("Moto");
		expect(rotuloDoBem("imovel")).toBe("Imóvel");
	});

	it("ausente ou desconhecido é null (a tela decide o que escrever)", () => {
		expect(rotuloDoBem(null)).toBeNull();
		expect(rotuloDoBem("")).toBeNull();
		expect(rotuloDoBem("consorcio")).toBeNull();
	});
});

describe("chaveCanonicaDoBem", () => {
	it("normaliza para as três chaves da régua", () => {
		expect(chaveCanonicaDoBem("auto")).toBe("carro");
		expect(chaveCanonicaDoBem("Automóvel")).toBe("carro");
		expect(chaveCanonicaDoBem("IMOVEL")).toBe("imovel");
		expect(chaveCanonicaDoBem("motocicleta")).toBe("moto");
	});
});
