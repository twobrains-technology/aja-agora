// FIX-436 (D7) — integração do `converse`: o artifact emitido carrega os
// números da TOOL de dado, não os que o modelo digitou na tool de apresentação.
//
// Reproduz o padrão de `db26cd54`: o modelo chama `compare_with_financing`
// (a tool executa de verdade e devolve o número certo), e no beat seguinte
// chama `present_financing_comparison` com número INVENTADO. O card desenhado
// tem que ser o da tool.
import type { ToolMessage } from "@langchain/core/messages";
import { afterAll, describe, expect, it } from "vitest";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { encryptIdentity } from "@/lib/conversation/identity";
import { compareWithFinancing } from "@/lib/finance/pmt";
import { limparCenario, runScenario } from "../testing/scenario";
import { modelosRoteirizados } from "../testing/scripted-model";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const IDENTIDADE_FALSA = { cpf: "52998224725", celular: "62999998888" };

const ARGS_DA_TOOL = {
	category: "auto" as const,
	creditValue: 180_000,
	termMonths: 200,
	consorcioMonthlyPayment: 5666.77,
	consorcioTotalCost: 266_338.19,
};

/** O número que o MODELO inventou para o card (o defeito de `db26cd54`). */
const NUMERO_INVENTADO = 6071;

const META_PRONTA = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "auto" as const,
	experiencePrev: "returning" as const,
	recoConsentAnswered: true,
	simulatorOfferDispatched: true,
	revealCompleted: true,
	qualifyAnswers: { creditMax: 180_000 },
	telefoneDoDesbloqueio: { variante: "A" as const },
	identityEnc: encryptIdentity(IDENTIDADE_FALSA),
};

describeIfDb("FIX-436 — o card pega o número do resultado da tool", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("financing_comparison sai com o número do compare_with_financing", async () => {
		const esperado = compareWithFinancing(ARGS_DA_TOOL);
		const resultado = await runScenario({
			channel: "web",
			metaInicial: META_PRONTA as never,
			turns: [
				{
					user: "e aí, vale mais que financiamento?",
					beats: [
						{
							text: "Deixa eu comparar.",
							toolCalls: [{ name: "compare_with_financing", args: ARGS_DA_TOOL }],
						},
						{
							text: "Olha a comparação.",
							toolCalls: [
								{
									name: "present_financing_comparison",
									args: {
										category: "auto",
										creditValue: 180_000,
										termMonths: 200,
										consorcio: { monthlyPayment: NUMERO_INVENTADO, totalCost: 278_372 },
										financing: {
											monthlyPayment: NUMERO_INVENTADO,
											totalCost: 278_372,
											annualRate: 22,
										},
										diff: { monthlyDelta: -404.23, totalDelta: -12_033.81 },
										disclaimer: "inventado",
									},
								},
							],
						},
					],
				},
			],
		});
		criadas.push(resultado.conversationId);

		const card = resultado.turns[0].events.find(
			(e): e is Extract<TurnEvent, { type: "artifact" }> =>
				e.type === "artifact" && e.artifactType === "financing_comparison",
		);
		expect(card).toBeDefined();

		const p = card?.payload as {
			financing: { monthlyPayment: number };
			consorcio: { monthlyPayment: number };
			diff: { monthlyDelta: number };
		};
		expect(p.financing.monthlyPayment).toBe(esperado.financing.monthlyPayment);
		expect(p.consorcio.monthlyPayment).toBe(esperado.consorcio.monthlyPayment);
		expect(p.diff.monthlyDelta).toBe(esperado.diff.monthlyDelta);
		// O número inventado NÃO chegou à tela.
		expect(p.financing.monthlyPayment).not.toBe(NUMERO_INVENTADO);
	});

	// B14.2 (FIX-436) — o card DESCARTADO não volta ao modelo como sucesso.
	it("card sem fonte: nenhum artifact e o modelo recebe uma recusa honesta", async () => {
		const indice = modelosRoteirizados.length;
		const resultado = await runScenario({
			channel: "web",
			metaInicial: META_PRONTA as never,
			turns: [
				{
					user: "me mostra a simulação",
					beats: [
						{
							text: "Deixa eu calcular.",
							// `get_rates` mantém o loop de tool-calls vivo (tool de dado pede fala);
							// `present_simulation_result` SEM `simulate_quota` antes ⇒ sem fonte.
							toolCalls: [
								{ name: "get_rates", args: {} },
								{
									name: "present_simulation_result",
									args: {
										groupId: "g-sem-fonte",
										administradora: "Itaú",
										category: "auto",
										creditValue: 180_000,
										monthlyPayment: 1092.5,
										adminFee: 27_000,
										reserveFund: 3600,
										insurance: 0,
										totalCost: 218_500,
										termMonths: 200,
										effectiveRate: 0.18,
									},
								},
							],
						},
						{ text: "Vou te mostrar as opções." },
					],
				},
			],
		});
		criadas.push(resultado.conversationId);

		// Sem fonte, o card NÃO sai.
		const artifact = resultado.turns[0].events.find(
			(e): e is Extract<TurnEvent, { type: "artifact" }> =>
				e.type === "artifact" && e.artifactType === "simulation_result",
		);
		expect(artifact).toBeUndefined();

		// E o modelo NÃO ouve "sucesso": o tool-result virou recusa honesta.
		const modelo = modelosRoteirizados[indice];
		if (!modelo) throw new Error("o cenário não criou o modelo roteirizado");
		const recebidas = modelo.mensagensRecebidas[1] ?? [];
		const toolResult = recebidas.find(
			(m): m is ToolMessage => m.getType() === "tool" && m.name === "present_simulation_result",
		);
		expect(toolResult).toBeDefined();
		const corpo = JSON.parse(toolResult?.content as string) as { error?: string };
		expect(corpo.error).toContain("simulate_quota");
	});
});
