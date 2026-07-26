// FIX-376 — o card de recomendação entalado entre a pergunta e os chips.
//
// Visto ao vivo (Kairo, 2026-07-25): o agente apresenta as cartas, pergunta
// "essa já seria sua primeira vez fazendo um consórcio?" — e ANTES dos chips de
// resposta ("É a primeira vez" / "Já conheço" / "Tenho dúvidas") aparece um card
// GRANDE destacando uma carta específica do Itaú. A pergunta e as respostas dela
// ficam separadas por um card que não tem nada a ver com o que foi perguntado.
//
// Causa: o reveal é em DOIS TEMPOS de propósito (`hero-awaits-reco-consent`,
// FIX-297/316) — a lista sai na hora, o hero espera a experiência ser respondida
// porque é ela que muda COMO a recomendação é explicada. O guard segurava
// `recommendation_card` e `simulation_result`, mas NÃO `group_card` — e
// `present_group_card` é justamente o caminho alternativo que o system-prompt
// oferece ao modelo pra destacar UM grupo (system-prompt.ts:578, "após
// present_recommendation_card OU present_group_card"). O hero legítimo ficava
// guardado esperando enquanto o mesmo grupo entrava pela porta destrancada.
//
// Este é um teste de ORDEM, não de texto: o que se asserta é quais cards podem
// existir neste ponto do funil. A fala do modelo segue livre.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Meta posicionada no gate `experience`: reveal concluído, hero guardado
 * aguardando a resposta. Os pré-requisitos vêm de `nextGate` (qualify-state.ts)
 * — nome, desire, crédito e identidade precisam estar resolvidos pra cascata
 * chegar aqui. */
const NO_GATE_EXPERIENCE = {
	desireAsked: true,
	identityCollected: true,
	qualifyAnswers: { creditMax: 180_000 },
	searchDispatched: true,
	revealCompleted: true,
	currentCategory: "auto" as const,
	// O hero JÁ está coagido e guardado — `advance` o libera sozinho assim que
	// a experiência for respondida. É exatamente o que torna a emissão de um
	// group_card aqui uma duplicata prematura.
	pendingRecommendationCard: {
		administradora: "Itaú",
		creditValue: 180_339,
		monthlyPayment: 4384.08,
		termMonths: 49,
	},
};

const CARTA_DO_ITAU = {
	groupId: "6a0ca9ca1b2c3d4e5f607182",
	administradora: "Itaú",
	creditValue: 180_339,
	monthlyPayment: 4384.08,
	termMonths: 49,
	availableSlots: 5,
};

describeIfDb("FIX-376 — hero não pode entalar entre a pergunta e os chips", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("segura o group_card enquanto a experiência não foi respondida", async () => {
		const r = await runScenario({
			metaInicial: NO_GATE_EXPERIENCE,
			turns: [
				{
					user: "confirmado",
					// TURNO DE SERVIDOR — é assim que o reveal entra (directive pós-submit
					// da identidade), e é o que faz o guard `reveal-loop` NÃO se aplicar:
					// ele exige `isUserTurn`. Com turno de usuário o card já era barrado
					// por lá e o bug não reproduzia.
					isUserTurn: false,
					beats: [
						{
							// O modelo faz o que fez ao vivo: comenta as cartas e, no mesmo
							// beat, destaca uma delas via present_group_card.
							text: "Perfeito, dados confirmados! Encontrei uma opção do Itaú bem redonda pro seu perfil.",
							toolCalls: [{ name: "present_group_card", args: CARTA_DO_ITAU }],
						},
						{
							text: "Antes de eu te indicar a melhor opção, essa é sua primeira vez fazendo um consórcio?",
						},
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		expect(turno.artifacts).not.toContain("group_card");
	});

	it("libera o group_card depois que a experiência foi respondida", async () => {
		const r = await runScenario({
			metaInicial: { ...NO_GATE_EXPERIENCE, experiencePrev: "first" as const },
			turns: [
				{
					user: "é a primeira vez",
					// Mesma condição do teste acima — a ÚNICA variável que muda entre os
					// dois é `experiencePrev`.
					isUserTurn: false,
					beats: [
						{
							text: "Show, então deixa eu te mostrar a que eu recomendo.",
							toolCalls: [{ name: "present_group_card", args: CARTA_DO_ITAU }],
						},
					],
				},
			],
		});
		criadas.push(r.conversationId);

		// O hold é TEMPORÁRIO — respondida a experiência, destacar um grupo volta
		// a ser legítimo. Sem esta metade, o fix viraria "nunca mostre group_card".
		expect(r.turns[0].artifacts).toContain("group_card");
	});
});
