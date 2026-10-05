// P1 + P2 — a fala e o card do turno pedem a MESMA coisa.
//
// Medido em produção (02–05/10/2026): 15 de 31 conversas morreram logo após o
// agente perguntar "Já tem um modelo em mente?" — o texto pedia o MODELO
// enquanto o card na tela pedia o VALOR. No turno do reveal com o desbloqueio
// do telefone pendente (braços A e B), o inverso: o card pedia o WhatsApp e o
// contexto do funil mandava o modelo perguntar experiência/prazo, duas
// perguntas no mesmo turno e a pessoa respondendo nenhuma.
//
// O que este teste prova é o FATO que o servidor controla: o contexto que chega
// ao modelo diz o que o card daquele turno pede. A fala continua do modelo —
// não se asserta prosa aqui.
import { SystemMessage } from "@langchain/core/messages";
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "../testing/grupos-do-mock";
import { limparCenario, runScenario } from "../testing/scenario";
import { modelosRoteirizados, type ScriptedChatModel } from "../testing/scripted-model";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Todo o texto de sistema que o modelo recebeu neste cenário, concatenado. */
function textosDosSistemas(modelo: ScriptedChatModel): string {
	return modelo.mensagensRecebidas
		.flat()
		.filter((m): m is SystemMessage => m instanceof SystemMessage)
		.map((m) => JSON.stringify(m.content))
		.join("\n");
}

describeIfDb("o card do turno e a fala pedem a mesma coisa", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("primeiro turno no gate do valor: o contexto diz que o card pede o VALOR", async () => {
		const i = modelosRoteirizados.length;
		const r = await runScenario({
			channel: "web",
			metaInicial: { desireAsked: true, currentCategory: "auto" as const } as never,
			turns: [{ user: "Quero comprar um carro", beats: [{ text: "Boa!" }] }],
		});
		criadas.push(r.conversationId);

		// O turno é o gate do valor (o funil manda quem diz a categoria direto
		// para `credit`), não o do modelo do bem.
		expect(r.turns[0].trilha).toContain("gate:credit");

		const sistemas = textosDosSistemas(modelosRoteirizados[i]);
		expect(sistemas).toContain("O CARD DESTE TURNO pede o VALOR do bem");
		expect(sistemas).toContain("parcela estimada");
		// A ordem antiga de perguntar o modelo antes do valor saiu do prompt do
		// repositório (o que o gate `grep` prova). O gerenciado do Langfuse carrega
		// a versão publicada até o `sync-prompts` — por isso a asserção de ausência
		// vive no teste da constante, não aqui.
	});

	for (const variante of ["A", "B"] as const) {
		it(`reveal sem telefone (braço ${variante}): o contexto diz que o card do WhatsApp aparece NESTE turno`, async () => {
			const i = modelosRoteirizados.length;
			const r = await runScenario({
				channel: "web",
				busca: buscaDoMock(96),
				metaInicial: {
					desireAsked: true,
					identityCollected: true,
					currentCategory: "auto",
					experiencePrev: "returning",
					recoConsentAnswered: true,
					simulatorOfferDispatched: true,
					qualifyAnswers: { creditMax: 180_000 },
					telefoneDoDesbloqueio: { variante },
				} as never,
				turns: [{ user: "manda as opções", beats: [{ text: "Deixa eu ver." }] }],
			});
			criadas.push(r.conversationId);

			// A busca rodou de verdade — sem isso o teste seria vazio.
			expect(r.meta.revealCompleted).toBe(true);

			const sistemas = textosDosSistemas(modelosRoteirizados[i]);
			expect(sistemas).toContain("NESTE turno o card que pede o WhatsApp aparece na tela");
			expect(sistemas).toContain("informar o número ali é o que LIBERA a comparação");
			// A pergunta do FUNIL não empurra mais o card: era ela que fazia o agente
			// perguntar prazo/experiência enquanto a tela pedia o telefone.
			expect(sistemas).not.toContain("Próximo passo do funil: descobrir em quanto tempo");
		});
	}
});