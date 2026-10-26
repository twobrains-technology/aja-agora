// L17/P139 — o card de cenários voltou a sair, com o cálculo da main.
//
// Na main o card vinha de `compute_scenarios` (tool de dado): o payload era o
// RESULTADO dela, nunca o número do modelo. Estes testes provam que o servidor
// continua montando os três cenários pelo MESMO motor, a partir da carta que a
// conversa mostrou — e que nada do que o modelo digita entra na conta.
import { describe, expect, it } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import { computeScenarios } from "@/lib/agent/scenarios";
import { computeContemplationDial } from "@/lib/consorcio/contemplation-dial";
import { cenariosDaCarta } from "./cenarios";

const CARTA: GroupSummary = {
	id: "cota-cenarios",
	administradora: "Canopus",
	category: "auto",
	creditValue: 80_000,
	monthlyPayment: 1_234.56,
	adminFeePercent: 17,
	termMonths: 96,
	totalParticipants: 1_200,
	availableSlots: 9,
	avgBidValue: 12_000,
	grupo: "70035",
};

describe("cenariosDaCarta — o mesmo cálculo da main, sobre a carta da conversa", () => {
	it("os três blocos são exatamente o retorno do motor para esta carta", () => {
		const payload = cenariosDaCarta(CARTA);

		// Entrada que a tool `compute_scenarios` da main montava com a oferta em
		// foco (creditValue/termMonths/monthlyPayment/avgBidValue).
		const esperado = computeScenarios({
			creditValue: CARTA.creditValue,
			termMonths: CARTA.termMonths,
			monthlyPayment: CARTA.monthlyPayment,
			averageBid: 12_000,
		});

		expect(payload.scenarios).toEqual({
			conservador: esperado.conservador,
			provavel: esperado.provavel,
			acelerado: esperado.acelerado,
		});
	});

	it("o lance de cada cenário sai do MESMO motor do dial, no mês daquele cenário", () => {
		const payload = cenariosDaCarta(CARTA);

		// 60% e 35% do prazo, arredondados pra cima (premissa do computeScenarios).
		expect(payload.scenarios.conservador.expectedTermMonths).toBe(CARTA.termMonths);
		expect(payload.scenarios.provavel.expectedTermMonths).toBe(58);
		expect(payload.scenarios.acelerado.expectedTermMonths).toBe(34);

		for (const [bloco, mes] of [
			["provavel", 58],
			["acelerado", 34],
		] as const) {
			const dial = computeContemplationDial({
				creditValue: CARTA.creditValue,
				termMonths: CARTA.termMonths,
				monthlyPayment: CARTA.monthlyPayment,
				averageBid: 12_000,
				targetMonth: mes,
			});
			expect(payload.scenarios[bloco].lancePercent).toBe(dial.requiredLancePct);
			expect(payload.scenarios[bloco].lanceValue).toBe(dial.requiredLanceValue);
		}
	});

	it("o conservador é sem lance — é o sorteio, não uma oferta", () => {
		const payload = cenariosDaCarta(CARTA);

		expect(payload.scenarios.conservador.lancePercent).toBe(0);
		expect(payload.scenarios.conservador.lanceValue).toBe(0);
		expect(payload.scenarios.conservador.ownResourcesValue).toBe(0);
	});

	it("o cabeçalho identifica a carta que está na tela", () => {
		const payload = cenariosDaCarta(CARTA);

		expect(payload.groupId).toBe(CARTA.id);
		expect(payload.administradora).toBe(CARTA.administradora);
		expect(payload.creditValue).toBe(CARTA.creditValue);
		expect(payload.termMonths).toBe(CARTA.termMonths);
	});

	it("o lance que o cliente declarou entra como dinheiro do bolso, não como embutido", () => {
		const semLance = cenariosDaCarta(CARTA);
		const comLance = cenariosDaCarta(CARTA, { lanceDeclarado: 20_000 });

		const esperado = computeScenarios({
			creditValue: CARTA.creditValue,
			termMonths: CARTA.termMonths,
			monthlyPayment: CARTA.monthlyPayment,
			averageBid: 12_000,
			ownCashAvailable: 20_000,
		});

		expect(comLance.scenarios).toEqual({
			conservador: esperado.conservador,
			provavel: esperado.provavel,
			acelerado: esperado.acelerado,
		});
		// O dinheiro do cliente muda a COMPOSIÇÃO do lance (menos embutido, mais bolso).
		expect(comLance.scenarios.provavel.ownResourcesValue).not.toBe(
			semLance.scenarios.provavel.ownResourcesValue,
		);
	});

	it("cliente recusou o embutido: nenhum cenário usa a carta como lance (L17/P139)", () => {
		// Comportamento da main: `usarLanceEmbutido: false` ⇒ `maxEmbutidoPct: 0`.
		const recusou = cenariosDaCarta(CARTA, { recusouEmbutido: true });

		const esperado = computeScenarios({
			creditValue: CARTA.creditValue,
			termMonths: CARTA.termMonths,
			monthlyPayment: CARTA.monthlyPayment,
			averageBid: 12_000,
			maxEmbutidoPct: 0,
		});

		expect(recusou.scenarios).toEqual({
			conservador: esperado.conservador,
			provavel: esperado.provavel,
			acelerado: esperado.acelerado,
		});
		// O embutido é o que cobre o lance SEM dinheiro do cliente. Zerado, tudo
		// que o lance pede sai do bolso dele — em nenhum cenário a carta entra.
		for (const bloco of ["provavel", "acelerado"] as const) {
			expect(recusou.scenarios[bloco].ownResourcesValue).toBe(recusou.scenarios[bloco].lanceValue);
		}
	});

	it("sem a recusa o embutido continua cobrindo parte do lance", () => {
		// Controle do teste acima: é a RECUSA que zera o embutido, não o motor.
		const semRecusa = cenariosDaCarta(CARTA, { recusouEmbutido: false });

		expect(semRecusa.scenarios).toEqual(cenariosDaCarta(CARTA).scenarios);
		expect(semRecusa.scenarios.provavel.ownResourcesValue).toBeLessThan(
			semRecusa.scenarios.provavel.lanceValue,
		);
	});

	it("dinheiro declarado e recusa ao embutido juntos: o lance é todo do bolso dele", () => {
		const payload = cenariosDaCarta(CARTA, { lanceDeclarado: 20_000, recusouEmbutido: true });

		const esperado = computeScenarios({
			creditValue: CARTA.creditValue,
			termMonths: CARTA.termMonths,
			monthlyPayment: CARTA.monthlyPayment,
			averageBid: 12_000,
			ownCashAvailable: 20_000,
			maxEmbutidoPct: 0,
		});

		expect(payload.scenarios.provavel).toEqual(esperado.provavel);
		expect(payload.scenarios.acelerado).toEqual(esperado.acelerado);
		expect(payload.scenarios.acelerado.ownResourcesValue).toBe(
			payload.scenarios.acelerado.lanceValue,
		);
		expect(payload.scenarios.acelerado.lanceValue).toBeGreaterThan(0);
	});

	it("carta sem lance médio não inventa lance médio (D11)", () => {
		const { avgBidValue: _semLanceMedio, ...semAvg } = CARTA;
		const payload = cenariosDaCarta(semAvg);

		const esperado = computeScenarios({
			creditValue: CARTA.creditValue,
			termMonths: CARTA.termMonths,
			monthlyPayment: CARTA.monthlyPayment,
		});

		expect(payload.scenarios).toEqual({
			conservador: esperado.conservador,
			provavel: esperado.provavel,
			acelerado: esperado.acelerado,
		});
	});
});
