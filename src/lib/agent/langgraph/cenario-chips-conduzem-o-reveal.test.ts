/**
 * O FLUXO: chips no turno do reveal seguram o gate.
 *
 * Este teste existe porque o anterior (`ancora-conduz-por-chips.test.ts`) prova a
 * função pura — e a função estava certa enquanto o call site a alimentava com
 * uma lista sempre vazia. Duas razões, as duas verificadas:
 *
 *   • o beat da âncora roda SEM tools, então nunca emite artifact;
 *   • o slice a partir de um "marco" descartava os cards do beat principal, que
 *     é justamente onde o `quick_reply` nasce.
 *
 * Resultado: teste unitário verde, comportamento inalterado no runtime — o
 * mesmo vício que esta entrega já cometeu com o prompt (regra na constante
 * errada) e com o guard de JSON (input que o pipeline não produz).
 *
 * Aqui o cenário roda o grafo de verdade: o modelo apresenta as ofertas e ancora
 * com chips, sem frase de condução. O gate do funil não pode cair embaixo — duas
 * perguntas e cinco botões no mesmo turno é o defeito do FIX-424.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	process.env.VITRINE_CPF = "11144477735";
	process.env.VITRINE_CELULAR = "62992496793";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

/** Pós-reveal com `experience` pendente — o gate que caía embaixo dos cards. */
const POS_REVEAL_COM_EXPERIENCE = {
	currentPersona: "auto" as const,
	currentCategory: "auto" as const,
	desireAsked: true,
	desireAnswered: true,
	identityCollected: false,
	searchDispatched: true,
	revealCompleted: true,
	qualifyAnswers: { creditMax: 80_000, desiredItem: "carro" },
};

describeIfDb("chips contam como condução no turno do reveal", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("modelo ancora com quick_reply → o gate do funil NÃO cai junto", async () => {
		const r = await runScenario({
			metaInicial: POS_REVEAL_COM_EXPERIENCE,
			turns: [
				{
					user: "me mostra as opções",
					intent: "providing_info",
					beats: [
						{
							// Sem frase de condução: quem pergunta é o card.
							text: "Perfeito!",
							toolCalls: [
								{
									name: "present_quick_reply",
									args: {
										options: [{ label: "Folga no bolso" }, { label: "Contemplar mais rápido" }],
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
		expect(turno.artifacts, "o cenário precisa dos chips na tela").toContain("quick_reply");
		const gates = turno.trilha.filter((t) => t.startsWith("gate:"));
		expect(gates, `chips E gate no mesmo turno — trilha: ${turno.trilha.join(" → ")}`).toEqual([]);
	});

	it("turno REALMENTE mudo (sem texto e sem card) devolve o gate", async () => {
		// A metade que mantém a rede viva. Sem isto, o conserto acima viraria "o
		// gate nunca mais volta", e o cliente ficaria diante dos cards sem nada a
		// responder — a sessão `ff8f2080`, que é o motivo de a rede existir.
		const r = await runScenario({
			metaInicial: POS_REVEAL_COM_EXPERIENCE,
			turns: [{ user: "me mostra as opções", intent: "providing_info", beats: [{ text: "" }] }],
		});
		criadas.push(r.conversationId);

		const turno = r.turns[0];
		expect(turno.artifacts).not.toContain("quick_reply");
		const gates = turno.trilha.filter((t) => t.startsWith("gate:"));
		expect(gates.length, `trilha: ${turno.trilha.join(" → ")}`).toBeGreaterThan(0);
	});
});
