// FIX-436 (D7) — prova que o payload do card pega os números do RESULTADO da
// tool de dado, não do argumento (inventado) do modelo. Reproduz `db26cd54`.
import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { payloadComNumerosDaFonte, resultadoMaisRecente, TOOL_DE_ORIGEM } from "./numeros-do-card";

function toolResult(
	nome: string,
	corpo: Record<string, unknown>,
	status: ToolMessage["status"] = "success",
): ToolMessage {
	return new ToolMessage({
		content: JSON.stringify(corpo),
		tool_call_id: `call_${nome}`,
		name: nome,
		status,
	});
}

describe("payloadComNumerosDaFonte", () => {
	it("financing_comparison: usa os números do compare_with_financing, não os do modelo (db26cd54)", () => {
		// O que a TOOL de fato devolveu.
		const daTool = toolResult("compare_with_financing", {
			consorcio: { monthlyPayment: 5666.77, totalCost: 266338.19 },
			financing: { monthlyPayment: 5678.45, totalCost: 266886.98, annualRate: 22 },
			diff: { monthlyDelta: -11.68, totalDelta: -548.79 },
			disclaimer: "Comparação estimativa baseada em taxa CET de 22% ao ano.",
		});
		// O que o MODELO digitou na tool de apresentação (inventado).
		const argsDoModelo: Record<string, unknown> = {
			category: "auto",
			creditValue: 180_000,
			termMonths: 200,
			consorcio: { monthlyPayment: 6071, totalCost: 278_372 },
			financing: { monthlyPayment: 6071, totalCost: 278_372, annualRate: 22 },
			diff: { monthlyDelta: -404.23, totalDelta: -12_033.81 },
			disclaimer: "estimativa",
		};

		const payload = payloadComNumerosDaFonte("financing_comparison", argsDoModelo, [daTool]);
		expect(payload).not.toBeNull();

		const p = payload as Record<string, unknown>;
		expect(p.financing).toEqual({ monthlyPayment: 5678.45, totalCost: 266886.98, annualRate: 22 });
		expect(p.consorcio).toEqual({ monthlyPayment: 5666.77, totalCost: 266338.19 });
		expect(p.diff).toEqual({ monthlyDelta: -11.68, totalDelta: -548.79 });
		// Os números inventados NÃO sobrevivem.
		expect((p.financing as { monthlyPayment: number }).monthlyPayment).not.toBe(6071);
		expect((p.diff as { monthlyDelta: number }).monthlyDelta).not.toBe(-404.23);
		// A chave (identidade) continua vindo do argumento do modelo.
		expect(p.category).toBe("auto");
		expect(p.creditValue).toBe(180_000);
		expect(p.termMonths).toBe(200);
	});

	it("simulation_result: usa os números do simulate_quota, não os do modelo", () => {
		const daTool = toolResult("simulate_quota", {
			creditValue: 180_000,
			monthlyPayment: 1092.5,
			adminFee: 27_000,
			reserveFund: 3600,
			insurance: 0,
			totalCost: 218_500,
			termMonths: 200,
			effectiveRate: 0.18,
		});
		const argsDoModelo: Record<string, unknown> = {
			groupId: "G171",
			administradora: "Itaú",
			category: "auto",
			creditValue: 180_000,
			monthlyPayment: 9999,
			adminFee: 1,
			reserveFund: 1,
			insurance: 1,
			totalCost: 1,
			termMonths: 200,
			effectiveRate: 0.01,
		};

		const p = payloadComNumerosDaFonte("simulation_result", argsDoModelo, [daTool]) as Record<
			string,
			unknown
		>;
		expect(p.monthlyPayment).toBe(1092.5);
		expect(p.totalCost).toBe(218_500);
		expect(p.effectiveRate).toBe(0.18);
		// Não-numérico (identidade) do modelo.
		expect(p.groupId).toBe("G171");
		expect(p.administradora).toBe("Itaú");
	});

	it("scenarios: usa os cenários do compute_scenarios, não os do modelo", () => {
		const daTool = toolResult("compute_scenarios", {
			conservador: { lancePercent: 0, expectedTermMonths: 200, strategy: "s", disclaimer: "d" },
			provavel: { lancePercent: 12, expectedTermMonths: 120, strategy: "s", disclaimer: "d" },
			acelerado: { lancePercent: 25, expectedTermMonths: 70, strategy: "s", disclaimer: "d" },
		});
		const argsDoModelo: Record<string, unknown> = {
			groupId: "G171",
			administradora: "Itaú",
			creditValue: 180_000,
			termMonths: 200,
			scenarios: {
				conservador: { lancePercent: 99, expectedTermMonths: 999, strategy: "x", disclaimer: "y" },
				provavel: { lancePercent: 99, expectedTermMonths: 999, strategy: "x", disclaimer: "y" },
				acelerado: { lancePercent: 99, expectedTermMonths: 999, strategy: "x", disclaimer: "y" },
			},
		};

		const p = payloadComNumerosDaFonte("scenarios", argsDoModelo, [daTool]) as {
			scenarios: Record<string, { expectedTermMonths: number; lancePercent: number }>;
			groupId: string;
		};
		expect(p.scenarios.conservador.expectedTermMonths).toBe(200);
		expect(p.scenarios.provavel.expectedTermMonths).toBe(120);
		expect(p.scenarios.acelerado.lancePercent).toBe(25);
		// Identidade do modelo.
		expect(p.groupId).toBe("G171");
	});

	it("sem resultado de origem ⇒ null (o card não sai)", () => {
		const args: Record<string, unknown> = { category: "auto", creditValue: 180_000 };
		expect(payloadComNumerosDaFonte("financing_comparison", args, [])).toBeNull();
	});

	it("resultado da tool ERRADA não serve de fonte", () => {
		const outra = toolResult("get_rates", { alguma: "coisa" });
		expect(payloadComNumerosDaFonte("financing_comparison", {}, [outra])).toBeNull();
	});

	it("ToolMessage com status de erro é ignorada", () => {
		const erro = toolResult(
			"compare_with_financing",
			{ consorcio: {}, financing: {}, diff: {} },
			"error",
		);
		expect(payloadComNumerosDaFonte("financing_comparison", {}, [erro])).toBeNull();
	});

	it("retorno sem número utilizável do simulate_quota não vira fonte", () => {
		const vazio = toolResult("simulate_quota", { erro: "DISCOVERY_NO_CONTEXT" });
		expect(payloadComNumerosDaFonte("simulation_result", {}, [vazio])).toBeNull();
	});

	// Extensão D7 (gerente): a cota ancorada no estado é fato do servidor e vale
	// como origem do `simulation_result` quando não há ToolMessage utilizável.
	it("simulation_result sem ToolMessage usa a cota ancorada da MESMA cota", () => {
		const cota = {
			groupId: "g-ancora",
			administradora: "ANCORA",
			creditValue: 200_000,
			monthlyPayment: 2405,
			termMonths: 116,
		};
		const argsDoModelo: Record<string, unknown> = {
			groupId: "g-ancora",
			administradora: "ANCORA",
			category: "auto",
			creditValue: 999_999,
			monthlyPayment: 1,
			termMonths: 1,
			adminFee: 42_000,
		};
		const p = payloadComNumerosDaFonte("simulation_result", argsDoModelo, [], cota) as Record<
			string,
			unknown
		>;
		expect(p.creditValue).toBe(200_000);
		expect(p.monthlyPayment).toBe(2405);
		expect(p.termMonths).toBe(116);
		// O número do modelo não passa, nem parcialmente.
		expect(p.adminFee).toBeUndefined();
	});

	it("cota ancorada de OUTRA cota não serve: o card é suprimido", () => {
		const cota = {
			groupId: "g-outro",
			administradora: "OUTRA",
			creditValue: 200_000,
			monthlyPayment: 2405,
			termMonths: 116,
		};
		const args: Record<string, unknown> = { groupId: "g-ancora", administradora: "ANCORA" };
		expect(payloadComNumerosDaFonte("simulation_result", args, [], cota)).toBeNull();
	});

	it("a cota ancorada só vale para simulation_result (não para financing/scenarios)", () => {
		const cota = {
			groupId: "g-ancora",
			administradora: "ANCORA",
			creditValue: 200_000,
			monthlyPayment: 2405,
			termMonths: 116,
		};
		expect(payloadComNumerosDaFonte("financing_comparison", {}, [], cota)).toBeNull();
		expect(payloadComNumerosDaFonte("scenarios", {}, [], cota)).toBeNull();
	});

	it("card sem número de oferta passa os argumentos intactos", () => {
		const args: Record<string, unknown> = { administradora: "Itaú" };
		expect(TOOL_DE_ORIGEM.recommendation_card).toBeUndefined();
		expect(payloadComNumerosDaFonte("recommendation_card", args, [])).toEqual(args);
	});

	it("resultadoMaisRecente devolve o ÚLTIMO resultado da tool", () => {
		const antigo = toolResult("simulate_quota", {
			creditValue: 1,
			monthlyPayment: 1,
			termMonths: 1,
		});
		const novo = toolResult("simulate_quota", { creditValue: 2, monthlyPayment: 2, termMonths: 2 });
		const outras: BaseMessage[] = [
			new ToolMessage({ content: "x", tool_call_id: "c", name: "get_rates" }),
		];
		expect(resultadoMaisRecente([antigo, ...outras, novo], "simulate_quota")).toMatchObject({
			creditValue: 2,
		});
	});
});
