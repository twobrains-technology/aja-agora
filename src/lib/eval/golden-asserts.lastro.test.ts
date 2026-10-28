import { describe, expect, it } from "vitest";
import type { GoldenTurnResult } from "./golden-asserts";
import { checkScenario, derivadosDaCarta } from "./golden-asserts";

/** A carta CANOPUS que aparece na conversa 21a20426 (rodada R6, 27/10/2026). */
const CARTA = {
	category: "auto",
	termMonths: 96,
	creditValue: 90000,
	monthlyPayment: 1176.39,
	avgBidValue: 71001,
	adminFeePercent: 20.8,
	administradora: "CANOPUS",
};

function turno(agentText: string, userMsg = "por que essa e não outra?"): GoldenTurnResult {
	return {
		userMsg,
		agentText,
		httpStatus: 200,
		error: null,
		artifactTypes: ["comparison_table"],
		artifacts: [{ type: "comparison_table", data: { groups: [CARTA] } }],
	};
}

describe("lastro do número: conta de carta não é invenção (medido em 27/10/2026)", () => {
	it("o custo total pela multiplicação parcela × prazo tem lastro", () => {
		// R6 `golden-hero-chega-na-tela` turno 9: 1.176,39 × 96 = 112.933,44. A fala dizia
		// "por volta de R$ 112,9 mil" e o assert acusava número inventado.
		const v = checkScenario([turno("O custo total dela fica por volta de R$ 112,9 mil.")], {
			turns: [{ forbidUngroundedMoney: true }],
		});
		expect(v.failures).toEqual([]);
		expect(v.pass).toBe(true);
	});

	it("número que NENHUMA conta de carta produz continua vermelho", () => {
		const v = checkScenario([turno("A parcela fica em R$ 999.000,00 por mês.")], {
			turns: [{ forbidUngroundedMoney: true }],
		});
		expect(v.pass).toBe(false);
		expect(v.failures.join(" ")).toContain("SEM LASTRO");
	});

	it("derivadosDaCarta não inventa: só produto e soma de dois campos", () => {
		const d = derivadosDaCarta([2, 3]);
		expect(d.sort((a, b) => a - b)).toEqual([5, 6]);
		expect(derivadosDaCarta([2, 3])).not.toContain(8);
	});
});

describe("expectAnyArtifact + orAgentTextMatches: o WhatsApp pedido em frase cumpre o turno (líder, 28/10 05:05)", () => {
	const asserts = {
		turns: [
			{
				expectAnyArtifact: ["whatsapp_optin"],
				orAgentTextMatches: ["me manda.{0,40}(whatsapp|n[úu]mero)"],
			},
		],
	};
	const turnoSem = (agentText: string): GoldenTurnResult => ({
		userMsg: "e se eu fechar a tela?",
		agentText,
		httpStatus: 200,
		error: null,
		artifactTypes: ["quick_reply"],
	});

	it("sem o card, a fala que pede o WhatsApp passa", () => {
		expect(
			checkScenario([turnoSem("Me manda seu WhatsApp que a gente segue por lá.")], asserts).pass,
		).toBe(true);
	});

	it("sem o card e sem pedir o contato, continua vermelho", () => {
		const v = checkScenario([turnoSem("Boa pergunta! Quer ver outra carta?")], asserts);
		expect(v.pass).toBe(false);
		expect(v.failures[0]).toMatch(/esperava UM de \[whatsapp_optin\]/);
	});
});
