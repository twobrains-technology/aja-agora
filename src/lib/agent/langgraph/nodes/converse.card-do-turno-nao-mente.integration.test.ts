// R2 (review 1) — o contexto não afirma que um card está na tela quando ele não está.
//
// O B1 fez o contexto do `converse` dizer ao modelo o que o card do turno pede.
// Correto — mas amarrado a "existe desbloqueio pendente e existe oferta", e não ao
// turno em que o card é de fato EMITIDO. O `adapter` (`src/lib/web/adapter.ts`)
// só escreve o `telefone_do_desbloqueio` no turno em que chega um artifact que
// revela oferta. Nos turnos seguintes o card NÃO reaparece — e o modelo era
// mandado apontar para um card inexistente ("NESTE turno o card aparece"),
// travando o funil. O mesmo vício em `cardDoValorNaTela`, que olhava
// `state.answeredGate` (o gate que o funil AGUARDA) em vez de `state.gate` (o
// card que de fato vai à tela neste turno).
//
// Aqui se prova o FATO que o servidor controla — o contexto que chega ao modelo.
// A fala continua do modelo; nada de prosa é assertado.
import { SystemMessage } from "@langchain/core/messages";
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "../testing/grupos-do-mock";
import { limparCenario, runScenario } from "../testing/scenario";
import { modelosRoteirizados, type ScriptedChatModel } from "../testing/scripted-model";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function textosDosSistemas(modelo: ScriptedChatModel): string {
	return modelo.mensagensRecebidas
		.flat()
		.filter((m): m is SystemMessage => m instanceof SystemMessage)
		.map((m) => JSON.stringify(m.content))
		.join("\n");
}

/** Posição de funil pronta para a busca (`buscaDoMock(96)` ⇒ G171). */
const PRONTO_PRA_BUSCAR = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "auto" as const,
	experiencePrev: "returning" as const,
	recoConsentAnswered: true,
	simulatorOfferDispatched: true,
	qualifyAnswers: { creditMax: 180_000 },
};

describeIfDb("R2 — o contexto não aponta card fora da tela", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("turno do reveal: o card do telefone É emitido — o contexto diz que aparece neste turno", async () => {
		const i = modelosRoteirizados.length;
		const r = await runScenario({
			channel: "web",
			busca: buscaDoMock(96),
			metaInicial: { ...PRONTO_PRA_BUSCAR, telefoneDoDesbloqueio: { variante: "A" } } as never,
			turns: [{ user: "manda as opções", beats: [{ text: "Deixa eu ver." }] }],
		});
		criadas.push(r.conversationId);

		// A busca rodou de verdade e pôs card na tela — sem isso o teste seria vazio.
		expect(r.turns[0].artifacts).toContain("comparison_table");

		const sistemas = textosDosSistemas(modelosRoteirizados[i]);
		expect(sistemas).toContain("NESTE turno o card que pede o WhatsApp aparece na tela");
	});

	it("turno POSTERIOR sem card: não diz que o card está na tela, e o fato do telefone permanece", async () => {
		const i = modelosRoteirizados.length;
		const r = await runScenario({
			channel: "web",
			metaInicial: {
				...PRONTO_PRA_BUSCAR,
				// A busca já rodou neste alvo e já revelou: `routeToDiscovery` NÃO
				// re-dispara a descoberta e nenhum card de oferta é emitido neste turno.
				searchDispatched: true,
				discoveredCreditTarget: 180_000,
				revealCompleted: true,
				recommendedAdministradora: "Canopus",
				recommendedOffer: {
					administradora: "Canopus",
					creditValue: 171_043,
					monthlyPayment: 1_092,
					termMonths: 96,
					groupId: "G171",
				},
				telefoneDoDesbloqueio: { variante: "A" },
			} as never,
			turns: [{ user: "e agora?", beats: [{ text: "Deixa eu te explicar." }] }],
		});
		criadas.push(r.conversationId);

		// Nenhum card de oferta neste turno — é o que torna a asserção não-vazia.
		expect(r.turns[0].artifacts).not.toContain("comparison_table");
		expect(r.turns[0].artifacts).not.toContain("recommendation_card");

		const sistemas = textosDosSistemas(modelosRoteirizados[i]);
		expect(sistemas).not.toContain("NESTE turno o card que pede o WhatsApp aparece na tela");
		// O fato verdadeiro permanece: as opções liberam quando ele informar o WhatsApp.
		expect(sistemas).toContain("informar o WhatsApp no card");
	});

	it("gate credit SUPRIMIDO neste turno: o contexto não afirma que o card do valor está na tela", async () => {
		const i = modelosRoteirizados.length;
		const r = await runScenario({
			channel: "web",
			metaInicial: { desireAsked: true, currentCategory: "auto" } as never,
			// `wants_more_options` suprime o gate (`decideShowGate`): o funil ainda
			// aguarda `credit` (`answeredGate`), mas NENHUM card vai à tela agora.
			turns: [
				{
					user: "quero ver todas as opções",
					intent: "wants_more_options",
					beats: [{ text: "Claro, deixa eu te mostrar." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.turns[0].trilha).not.toContain("gate:credit");

		const sistemas = textosDosSistemas(modelosRoteirizados[i]);
		expect(sistemas).not.toContain("O CARD DESTE TURNO pede o VALOR do bem");
	});
});
