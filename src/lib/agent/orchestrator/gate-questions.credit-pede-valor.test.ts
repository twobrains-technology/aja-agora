// P1 — o gate do VALOR pergunta o valor, não o modelo do bem.
//
// O card que está na tela no gate `credit` (web) é a agulha do valor do bem com
// a parcela estimada ao vivo. Enquanto a pergunta canônica abria com "já tem um
// modelo em mente?", o texto pedia uma coisa e o card pedia outra no mesmo
// turno — 15 de 31 conversas morreram ali (medido 02–05/10/2026).
import { describe, expect, it } from "vitest";
import { gateQuestion } from "./gate-questions";

describe("gate `credit` — a pergunta é a do card: o VALOR do bem", () => {
	it("sem bem específico, pergunta o valor e mantém 'valor do bem' (FIX-2)", () => {
		const pergunta = gateQuestion("credit", "auto", undefined, "web");
		expect(pergunta).toContain("valor do bem");
		expect(pergunta).not.toContain("modelo em mente");
	});

	it("na retomada, também não abre com o modelo do bem", () => {
		const pergunta = gateQuestion("credit", "auto", undefined, "web", undefined, null, 2);
		expect(pergunta).toContain("valor do bem");
		expect(pergunta).not.toContain("modelo em mente");
	});

	it("com bem específico, continua referenciando o bem (FIX-296/FIX-312)", () => {
		const pergunta = gateQuestion("credit", "auto", undefined, "web", undefined, "um Corolla");
		expect(pergunta).toBe("E quanto custa esse Corolla hoje?");
	});

	it("com valor já mencionado, confirma em vez de perguntar (FIX-284)", () => {
		const pergunta = gateQuestion("credit", "auto", undefined, "web", 80_000);
		expect(pergunta).toContain("80.000");
		expect(pergunta).not.toContain("modelo em mente");
	});
});