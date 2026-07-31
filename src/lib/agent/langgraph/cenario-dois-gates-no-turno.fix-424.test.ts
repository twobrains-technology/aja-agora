// FIX-424 — dois conjuntos de botões esperando resposta na mesma tela.
//
// Visto ao vivo (Kairo, 2026-07-30), WhatsApp 21:02:
//
//   [card] Simulação de Cota · R$ 200.000 · R$ 2.405/mês · 116 meses
//          [Tenho interesse!]  [Ajustar valor]
//   "Você já fez consórcio antes?"
//          [É a primeira vez]  [Já conheço]  [Tenho dúvidas]
//
// Cinco botões, duas perguntas, um turno. O cliente não sabe qual responder, e
// responder uma joga a outra fora. "Não deveria ter trazido 2 gates de resposta,
// não faz sentido."
//
// É a MESMA família do defeito que o turno de apresentação já resolveu (card e
// pergunta disputando o mesmo turno) e do guard `quick-reply-com-card-de-peso`
// (atalho enterrado por card) — agora pela terceira porta: um card com CTA que o
// MODELO emitiu, e o gate do FUNIL logo abaixo.
//
// A regra que faltava, e que este teste trava: quando o turno já entregou um card
// que PEDE AÇÃO, esse card é a pergunta do turno. O gate espera o próximo.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Pós-reveal, com o gate `experience` pendente — exatamente o estado do print:
 * as ofertas já apareceram num turno anterior e o funil ainda quer saber a
 * experiência do cliente. */
const POS_REVEAL_COM_EXPERIENCE_PENDENTE = {
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

describeIfDb("FIX-424 — card com CTA e gate do funil não disputam o mesmo turno", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("modelo mostra a simulação (com botões) → o gate NÃO sai junto", async () => {
		const r = await runScenario({
			channel: "whatsapp",
			metaInicial: POS_REVEAL_COM_EXPERIENCE_PENDENTE,
			turns: [
				{
					user: "quero ver os números da Âncora",
					// `providing_info` é o intent de quem aponta uma cota e pede os
					// números dela — é o que o guard `reveal-loop` exige pra não tratar a
					// simulação como re-reveal (artifact-guard.ts). Sem isso o card nem
					// sai e o cenário deixa de ser o do print.
					intent: "providing_info",
					beats: [
						{
							text: "Beleza, vou te mostrar os números da ÂNCORA!",
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
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		// Sentinela: sem o card na tela o cenário não é o do print.
		expect(turno.artifacts, "o turno precisa ter mostrado a simulação").toContain(
			"simulation_result",
		);
		// O INVARIANTE: um turno, uma pergunta. O card com CTA já é a pergunta.
		const gates = turno.trilha.filter((t) => t.startsWith("gate:"));
		expect(
			gates,
			`o turno trouxe card com CTA E gate — trilha: ${turno.trilha.join(" → ")}`,
		).toEqual([]);
	});

	it("sem card com CTA, o gate sai normalmente — o fix não emudece o funil", async () => {
		// A metade que impede isto de virar "o funil nunca mais pergunta". Turno de
		// conversa pura (o modelo só fala) tem que continuar levando o gate.
		const r = await runScenario({
			channel: "whatsapp",
			metaInicial: POS_REVEAL_COM_EXPERIENCE_PENDENTE,
			turns: [
				{
					user: "consórcio tem juros?",
					beats: [{ text: "Não tem juros, só a taxa de administração." }],
				},
			],
		});
		criadas.push(r.conversationId);

		const gates = r.turns[0].trilha.filter((t) => t.startsWith("gate:"));
		expect(gates.length, `trilha: ${r.turns[0].trilha.join(" → ")}`).toBeGreaterThan(0);
	});
});
