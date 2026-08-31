/**
 * O formulário de identidade não cede a vez no fecho.
 *
 * Encontrado exercitando o app depois de mover o `identify` para o fechamento
 * (a vitrine tirou o CPF de antes da busca). O cliente escolhe a cota, e:
 *
 *   👤 sim, quero contratar essa
 *   🤖 "Perfeito! O formulário de contratação está aparecendo na tela agora.
 *      Preenche com seus dados (CPF, celular...)"
 *   [route] gate=identify show=true      ← o funil PEDIU o gate
 *   stream: CARDS=[recommendation_card]  GATES=[]   ← e ele não saiu
 *
 * O agente anuncia um formulário que nunca aparece, e a venda morre no último
 * metro — com o cliente decidido.
 *
 * A causa é uma regra correta aplicada ao gate errado: "um turno, uma pergunta"
 * (FIX-424). Quando o turno já entregou um card que pede ação, esse card É a
 * pergunta e o gate espera o próximo turno. A exceção são os gates que SÃO o
 * pedido de ação — `GATES_DE_ACAO`, que listava apenas `decision` e `contract`.
 *
 * Enquanto o `identify` morava antes da busca, ele nunca disputava turno com
 * card de oferta e a lista estava completa. Ao descer para o fecho, ele passou a
 * viver exatamente onde `recommendation_card` e `simulation_result` são
 * emitidos — e começou a ser engolido. É regressão da mudança de 2026-08-27,
 * não defeito do FIX-424.
 *
 * `identify` no fecho é o pedido de ação do turno: é a troca do documento pelo
 * contrato. Ele não cede a vez para o card que mostra a cota que o cliente
 * acabou de escolher.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

// O cenário declarado é o do FECHO, e ele só existe com a vitrine ligada — sem
// ela o `identify` volta a ser pré-busca e o teste provaria outro caminho.
// `vitest.setup.ts` zera estas envs por default (a suíte nasce sem vitrine).
const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	process.env.VITRINE_CPF = "11144477735";
	process.env.VITRINE_CELULAR = "62992496793";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** O cliente viu as cartas pela vitrine, escolheu uma, e ainda não deu o CPF. */
const ESCOLHEU_SEM_IDENTIDADE = {
	currentPersona: "auto" as const,
	currentCategory: "auto" as const,
	desireAsked: true,
	desireAnswered: true,
	identityCollected: false,
	searchDispatched: true,
	revealCompleted: true,
	experienceDispatched: true,
	simulacaoApresentada: true,
	escolha: { groupId: "g-itau", administradora: "ITAÚ", origem: "mencao" as const },
	qualifyAnswers: {
		creditMax: 80_000,
		desiredItem: "carro",
		prazoMeses: 48,
		hasLance: "no" as const,
	},
	recommendedAdministradora: "ITAÚ",
	recommendedOffer: {
		administradora: "ITAÚ",
		category: "auto" as const,
		creditValue: 81_973,
		termMonths: 48,
		monthlyPayment: 1_992,
		groupId: "g-itau",
	},
};

describeIfDb("o gate de identidade não é engolido pelo card da cota escolhida", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("card da cota no mesmo turno NÃO cala o pedido de identidade", async () => {
		const r = await runScenario({
			metaInicial: ESCOLHEU_SEM_IDENTIDADE,
			turns: [
				{
					user: "sim, quero contratar essa",
					intent: "providing_info",
					beats: [
						{
							text: "Perfeito! Vamos fechar essa.",
							toolCalls: [
								{
									name: "present_simulation_result",
									args: {
										groupId: "g-itau",
										administradora: "ITAÚ",
										category: "auto",
										creditValue: 81_973,
										monthlyPayment: 1_992,
										termMonths: 48,
									},
								},
							],
						},
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		const gates = turno.trilha.filter((t) => t.startsWith("gate:"));
		// Sentinela: sem o card na tela o cenário não é o observado no app.
		expect(turno.artifacts, "o turno precisa ter mostrado a cota").toContain("simulation_result");
		expect(
			gates.join(","),
			`o cliente decidiu e o formulário não apareceu — trilha: ${turno.trilha.join(" → ")}`,
		).toContain("identify");
	});
});
