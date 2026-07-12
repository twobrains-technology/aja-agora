// FIX-284 (r9 onda 2, veredito Sonnet 5 pós-onda-1, G-F): em TODOS os 5
// dossiês do baseline o valor do bem já era mencionado de forma aproximada no
// turno do `desire` ("uns 250 mil", "uns 70 mil"...) e o `gate:credit` pedia o
// MESMO dado do zero 2 turnos depois — viola "sem pedir dado já dado". A
// string do gate `credit` era estática, sem acesso a nenhum valor mencionado
// antes. Agora `gateQuestion("credit", ...)` aceita o valor capturado no
// desire (`qualifyAnswers.creditMentionedAtDesire`, FIX-284) e devolve copy de
// CONFIRMAÇÃO em vez de perguntar do zero.
import { describe, expect, it } from "vitest";
import { gateQuestion } from "./gate-questions";

describe("FIX-284 — gate credit confirma o valor já mencionado no desire", () => {
	it("com valor mencionado, devolve copy de CONFIRMAÇÃO citando o valor (não pergunta do zero)", () => {
		const q = gateQuestion("credit", "auto", undefined, "whatsapp", 70_000);
		expect(q).not.toBeNull();
		expect(q).toMatch(/70\.000/);
		expect(q?.toLowerCase()).toMatch(/isso|certo|ajustar/);
		expect(q).not.toBe("Qual valor do bem faz mais sentido pra você?");
	});

	it("sem valor mencionado, mantém o texto atual (fallback, D11 — não quebra os call-sites existentes)", () => {
		expect(gateQuestion("credit", "auto")).toBe("Qual valor do bem faz mais sentido pra você?");
		expect(gateQuestion("credit", "auto", undefined, "whatsapp", undefined)).toBe(
			"Qual valor do bem faz mais sentido pra você?",
		);
	});

	it("valor mencionado 0 ou inválido não dispara a confirmação (defensivo)", () => {
		expect(gateQuestion("credit", "auto", undefined, "whatsapp", 0)).toBe(
			"Qual valor do bem faz mais sentido pra você?",
		);
	});

	it("funciona também no canal web", () => {
		const q = gateQuestion("credit", "imovel", undefined, "web", 250_000);
		expect(q).toMatch(/250\.000/);
	});
});
