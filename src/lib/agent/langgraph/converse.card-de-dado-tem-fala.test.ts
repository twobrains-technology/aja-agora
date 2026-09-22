// L4 — CARD DE DADO NÃO DEIXA O TURNO MUDO.
//
// Medido em produção (21/09/2026): `[card: simulation_result]` e
// `[card: comparison_table]` chegando sozinhos na tela — o modelo chamou a tool
// de apresentação sem escrever nada antes, e como tool de apresentação encerra
// o loop (`pedeFalaDepoisDasTools`), o turno acabava no card, sem uma palavra
// que explicasse o número que o cliente estava olhando.
//
// O card É a resposta, mas um dado sem comentário não deixa o cliente com o que
// reagir. O invariante: turno que entrega card de DADO e nada mais recebe uma
// frase do MODELO — nunca texto pré-fabricado no servidor. É por isso que este
// teste roteia um SEGUNDO beat: sem o conserto, ele não é consumido e o turno
// termina no card.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Pós-reveal com a cota na mão — o estado em que o cliente pede "os números
 * dessa" e recebia só o card. */
const POS_REVEAL = {
	currentPersona: "auto" as const,
	currentCategory: "auto" as const,
	desireAsked: true,
	desireAnswered: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	qualifyAnswers: { creditMax: 200_000, desiredItem: "carro" },
	recommendedAdministradora: "ANCORA",
	recommendedOffer: {
		administradora: "ANCORA",
		category: "auto" as const,
		creditValue: 200_000,
		termMonths: 116,
		monthlyPayment: 2_405,
		groupId: "g-ancora",
	},
};

describeIfDb("L4 — card de dado sem fala recebe a frase de apoio do modelo", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("simulação entregue sem texto → o turno termina com a fala de apoio", async () => {
		const r = await runScenario({
			metaInicial: POS_REVEAL,
			turns: [
				{
					user: "quero ver os números da Âncora",
					// `providing_info` é o intent de quem aponta uma cota e pede os números
					// dela — o que o guard `reveal-loop` exige pra o card sair.
					intent: "providing_info",
					beats: [
						{
							text: "",
							toolCalls: [
								{
									name: "present_simulation_result",
									args: {
										groupId: "g-ancora",
										administradora: "ANCORA",
										category: "auto",
										creditValue: 200_000,
										monthlyPayment: 2_405,
										termMonths: 116,
									},
								},
							],
						},
						// O beat que o LOOP de apresentação não consome. Deixá-lo roteirado é
						// o que dá ao teste o poder de falhar: sem o apoio, ele fica na fila
						// e o turno entrega só o card.
						{
							text: "É a Âncora: carta de R$ 200.000 em 116 meses, parcela de R$ 2.405.",
						},
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		// Sentinela: sem o card na tela o cenário não é o do defeito.
		expect(turno.artifacts, "o turno precisa ter mostrado a simulação").toContain(
			"simulation_result",
		);
		expect(
			turno.trilha[turno.trilha.length - 1],
			`o turno terminou no card, sem uma palavra sobre ele — trilha: ${turno.trilha.join(" → ")}`,
		).toBe("text");
	});

	it("card de dado ACOMPANHADO de fala não ganha beat extra", async () => {
		const r = await runScenario({
			metaInicial: POS_REVEAL,
			turns: [
				{
					user: "quero ver os números da Âncora",
					intent: "providing_info",
					beats: [
						{
							text: "Beleza, vou te mostrar os números da Âncora!",
							toolCalls: [
								{
									name: "present_simulation_result",
									args: {
										groupId: "g-ancora",
										administradora: "ANCORA",
										category: "auto",
										creditValue: 200_000,
										monthlyPayment: 2_405,
										termMonths: 116,
									},
								},
							],
						},
						// Se o apoio disparasse com o turno já falado, consumiria ESTE beat e
						// o agente falaria duas vezes — o defeito do FIX-422 por outra porta.
						{ text: "Fala que não devia ter saído." },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		expect(turno.artifacts).toContain("simulation_result");
		expect(
			turno.trilha,
			`o turno já tinha fala e ganhou outra — trilha: ${turno.trilha.join(" → ")}`,
		).not.toContain("text → artifact:simulation_result → text");
	});
});
