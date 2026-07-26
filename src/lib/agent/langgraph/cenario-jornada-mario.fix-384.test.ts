// FIX-384 — jornada MARIO do mock de referência (`aja-dois-cenarios_3.html`).
//
// O perfil: quer um usado de ~R$ 90 mil, chega dizendo que está SEM GRANA pra
// entrada e, quando perguntado sobre lance, responde "não quero comprometer
// nada além da parcela". No mock, esse caminho tem um desfecho próprio: em vez
// de empurrar lance/simulador, o agente mostra os DOIS CAMINHOS honestos
// (esperar o sorteio × um lance pequeno lá na frente) e devolve a escolha.
//
// ⚠️ O QUE ESTE CENÁRIO **NÃO** FAZ: travar a coreografia do mock. Como o
// agente desarma a objeção da entrada, com que palavras apresenta os caminhos e
// em que ordem conversa é do MODELO — engessar isso viraria o formulário de
// balões que este produto combate (CLAUDE.md).
//
// O que ele prova é um invariante de RESPEITO AO CLIENTE, e esse sim é código:
// quem acabou de dizer "não quero comprometer nada além da parcela" não pode
// receber card de lance embutido nem o simulador de contemplação. Empurrar isso
// é vender o que ele recusou — e o cliente percebe.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-384 — jornada Mario (só parcela / sorteio)", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("quem diz 'só parcela' vê os dois caminhos, não o lance embutido", async () => {
		const r = await runScenario({
			busca: buscaDoMock(120),
			// Já com o reveal feito e a experiência respondida — o recorte deste
			// cenário é o ramo de LANCE, que é o que distingue o Mario.
			metaInicial: {
				desireAsked: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				searchDispatched: true,
				revealCompleted: true,
				experiencePrev: "first",
				qualifyAnswers: { creditMax: 90_000, prazoMeses: 120 },
			},
			turns: [
				{
					user: "Não quero comprometer nada além da parcela",
					// É o rótulo do chip do gate `lance` — dado, não interpretação.
					extrai: (meta) => {
						meta.qualifyAnswers = { ...meta.qualifyAnswers, hasLance: "so_parcela" };
					},
					beats: [{ text: "Perfeito, respeito total. Deixa eu te mostrar os dois caminhos." }],
				},
			],
		});
		criadas.push(r.conversationId);

		const trilha = r.turns[0].trilha.join(" ");

		// O card do mock pra este perfil.
		expect(trilha).toContain("artifact:two_paths");
		// E o que NÃO pode aparecer: ele acabou de dizer que não compromete nada
		// além da parcela. Empurrar embutido/simulador aqui é vender o que ele
		// recusou.
		expect(trilha).not.toContain("artifact:embedded_bid");
		expect(trilha).not.toContain("gate:lance-embutido");
		expect(trilha).not.toContain("gate:simulator-offer");
	});

	it("registra a escolha por só-parcela no estado", async () => {
		const r = await runScenario({
			busca: buscaDoMock(120),
			metaInicial: {
				desireAsked: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				searchDispatched: true,
				revealCompleted: true,
				experiencePrev: "first",
				qualifyAnswers: { creditMax: 90_000, prazoMeses: 120 },
			},
			turns: [
				{
					user: "Não quero comprometer nada além da parcela",
					extrai: (meta) => {
						meta.qualifyAnswers = { ...meta.qualifyAnswers, hasLance: "so_parcela" };
					},
					beats: [{ text: "Respeitado." }],
				},
			],
		});
		criadas.push(r.conversationId);

		// Sobrevive ao ciclo — senão o turno seguinte volta a oferecer lance.
		expect(r.meta.qualifyAnswers?.hasLance).toBe("so_parcela");
	});
});
