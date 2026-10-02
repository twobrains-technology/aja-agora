// FIX-436 (D7) — prova que o payload do card pega os números do RESULTADO da
// tool de dado, não do argumento (inventado) do modelo. Reproduz `db26cd54`.
import { AIMessage, type BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import {
	fonteMaisRecente,
	payloadComNumerosDaFonte,
	resultadoMaisRecente,
	TOOL_DE_ORIGEM,
	toolResultsComRecusaDeCard,
} from "./numeros-do-card";

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

	// B17 (revisão C15b) — o `compute_scenarios` NÃO recebe `creditValue` (o schema do
	// grafo só aceita `usarLanceEmbutido`) e o RESULTADO não carrega a cota. Logo a
	// única prova possível é o TURNO: um resultado de `compute_scenarios` de outro
	// turno pode ser de outra cota e não pode desenhar o card deste.
	it("scenarios: resultado de OUTRO turno (fonte velha de outra cota) não desenha o card", () => {
		const turnoAnterior = new HumanMessage("quais os cenários?");
		const chamadaAntiga = new AIMessage({
			content: "",
			tool_calls: [
				{ id: "call_sc_velho", name: "compute_scenarios", args: { usarLanceEmbutido: true } },
			],
		});
		const daOutraCota = new ToolMessage({
			content: JSON.stringify({
				conservador: { lancePercent: 0, expectedTermMonths: 200, strategy: "s", disclaimer: "d" },
				provavel: { lancePercent: 12, expectedTermMonths: 120, strategy: "s", disclaimer: "d" },
				acelerado: { lancePercent: 25, expectedTermMonths: 70, strategy: "s", disclaimer: "d" },
			}),
			tool_call_id: "call_sc_velho",
			name: "compute_scenarios",
		});
		const turnoDeAgora = new HumanMessage("e os cenários da Canopus?");
		const argsDoModelo: Record<string, unknown> = {
			groupId: "canopus-99",
			administradora: "Canopus",
			creditValue: 200_000,
			termMonths: 200,
		};
		expect(
			payloadComNumerosDaFonte("scenarios", argsDoModelo, [
				turnoAnterior,
				chamadaAntiga,
				daOutraCota,
				turnoDeAgora,
			]),
		).toBeNull();
	});

	it("scenarios: resultado do MESMO turno usa os cenários da tool", () => {
		const turno = new HumanMessage("me mostra os cenários");
		const chamada = new AIMessage({
			content: "",
			tool_calls: [{ id: "call_sc", name: "compute_scenarios", args: {} }],
		});
		const daTool = new ToolMessage({
			content: JSON.stringify({
				conservador: { lancePercent: 0, expectedTermMonths: 200, strategy: "s", disclaimer: "d" },
				provavel: { lancePercent: 12, expectedTermMonths: 120, strategy: "s", disclaimer: "d" },
				acelerado: { lancePercent: 25, expectedTermMonths: 70, strategy: "s", disclaimer: "d" },
			}),
			tool_call_id: "call_sc",
			name: "compute_scenarios",
		});
		const argsDoModelo: Record<string, unknown> = {
			groupId: "G171",
			administradora: "Itaú",
			creditValue: 180_000,
			termMonths: 200,
		};
		const p = payloadComNumerosDaFonte("scenarios", argsDoModelo, [turno, chamada, daTool]) as {
			scenarios: Record<string, { expectedTermMonths: number; lancePercent: number }>;
		};
		expect(p.scenarios.provavel.expectedTermMonths).toBe(120);
		expect(p.scenarios.acelerado.lancePercent).toBe(25);
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

	// B14.1 — a fonte velha de OUTRA cota não pode desenhar o card desta.
	it("simulation_result de OUTRA cota não usa o resultado da tool (fonte velha)", () => {
		const daOutraCota = toolResult("simulate_quota", {
			groupId: "itau-158",
			creditValue: 180_000,
			monthlyPayment: 1092.5,
			totalCost: 218_500,
			termMonths: 200,
			effectiveRate: 0.18,
		});
		const argsDoModelo: Record<string, unknown> = {
			groupId: "canopus-99",
			administradora: "Canopus",
			category: "auto",
			creditValue: 180_000,
			monthlyPayment: 9999,
			termMonths: 200,
		};
		expect(payloadComNumerosDaFonte("simulation_result", argsDoModelo, [daOutraCota])).toBeNull();
	});

	it("simulation_result da MESMA cota usa o resultado (groupId casa sem caixa)", () => {
		const daTool = toolResult("simulate_quota", {
			groupId: "g171",
			creditValue: 180_000,
			monthlyPayment: 1092.5,
			totalCost: 218_500,
			termMonths: 200,
			effectiveRate: 0.18,
		});
		const argsDoModelo: Record<string, unknown> = {
			groupId: "G171",
			administradora: "Itaú",
			creditValue: 9999,
			monthlyPayment: 1,
			termMonths: 200,
		};
		const p = payloadComNumerosDaFonte("simulation_result", argsDoModelo, [daTool]) as Record<
			string,
			unknown
		>;
		expect(p.monthlyPayment).toBe(1092.5);
	});

	it("financing_comparison de OUTRA carta não usa o resultado (fonte velha)", () => {
		const chamada = new AIMessage({
			content: "",
			tool_calls: [
				{
					id: "call_cmp",
					name: "compare_with_financing",
					args: { category: "auto", creditValue: 200_000, termMonths: 200 },
				},
			],
		});
		const daTool = new ToolMessage({
			content: JSON.stringify({
				consorcio: { monthlyPayment: 5666.77, totalCost: 266_338.19 },
				financing: { monthlyPayment: 5678.45, totalCost: 266_886.98, annualRate: 22 },
				diff: { monthlyDelta: -11.68, totalDelta: -548.79 },
			}),
			tool_call_id: "call_cmp",
			name: "compare_with_financing",
		});
		const argsDoModelo: Record<string, unknown> = {
			category: "auto",
			creditValue: 180_000,
			termMonths: 200,
		};
		expect(
			payloadComNumerosDaFonte("financing_comparison", argsDoModelo, [chamada, daTool]),
		).toBeNull();
	});

	it("financing_comparison da MESMA carta usa o resultado da tool", () => {
		const chamada = new AIMessage({
			content: "",
			tool_calls: [
				{
					id: "call_cmp",
					name: "compare_with_financing",
					args: { category: "auto", creditValue: 180_000, termMonths: 200 },
				},
			],
		});
		const daTool = new ToolMessage({
			content: JSON.stringify({
				consorcio: { monthlyPayment: 5666.77, totalCost: 266_338.19 },
				financing: { monthlyPayment: 5678.45, totalCost: 266_886.98, annualRate: 22 },
				diff: { monthlyDelta: -11.68, totalDelta: -548.79 },
			}),
			tool_call_id: "call_cmp",
			name: "compare_with_financing",
		});
		const argsDoModelo: Record<string, unknown> = {
			category: "auto",
			creditValue: 180_000,
			termMonths: 200,
		};
		const p = payloadComNumerosDaFonte("financing_comparison", argsDoModelo, [
			chamada,
			daTool,
		]) as Record<string, unknown>;
		expect((p.financing as { monthlyPayment: number }).monthlyPayment).toBe(5678.45);
	});

	it("fonteMaisRecente devolve os args da chamada da tool (para a carta)", () => {
		const chamada = new AIMessage({
			content: "",
			tool_calls: [
				{
					id: "call_cmp",
					name: "compare_with_financing",
					args: { category: "auto", creditValue: 180_000, termMonths: 200 },
				},
			],
		});
		const daTool = new ToolMessage({
			content: JSON.stringify({ consorcio: {}, financing: {}, diff: {} }),
			tool_call_id: "call_cmp",
			name: "compare_with_financing",
		});
		const fonte = fonteMaisRecente([chamada, daTool], "compare_with_financing");
		expect(fonte?.args?.creditValue).toBe(180_000);
	});

	// B14.2 — o card descartado não pode voltar ao modelo como SUCESSO.
	it("card descartado: o tool-result de sucesso vira recusa honesta", () => {
		const ok = new ToolMessage({
			content: "[Comparativo apresentado]",
			tool_call_id: "call_x",
			name: "present_financing_comparison",
		});
		const outro = new ToolMessage({
			content: "ok",
			tool_call_id: "call_y",
			name: "simulate_quota",
		});
		const saida = toolResultsComRecusaDeCard(
			[ok, outro],
			new Map([["call_x", "compare_with_financing"]]),
		);
		const recusado = saida[0] as ToolMessage;
		// Recusa pela CONVENÇÃO da casa ({ error }, status de sucesso), não status cru.
		expect(recusado.status).not.toBe("error");
		const corpo = JSON.parse(recusado.content as string) as { error?: string };
		expect(corpo.error).toContain("compare_with_financing");
		expect(corpo.error).toContain("não foi exibido");
		expect((saida[1] as ToolMessage).content).toBe("ok");
	});

	it("sem cards descartados: o array sai intacto", () => {
		const m = new ToolMessage({ content: "ok", tool_call_id: "c", name: "x" });
		expect(toolResultsComRecusaDeCard([m], new Map())).toEqual([m]);
	});
});
