// O watchdog passa a enxergar o turno que não conduziu.
//
// `pendingGateAfterTurn` decidia por ROTA: `gateFired: Boolean(state.gate)` — ou
// seja, "o funil calculou um gate para este turno". Só que calcular não é
// entregar. No turno do reveal o gate é suprimido de propósito (quem fecha é a
// âncora), e na sessão `ff8f2080` a âncora também não saiu: o cliente ficou
// diante de cinco cards sem nada a responder, e o marcador que o worker
// `gate-reengage-poll` procura NUNCA foi gravado. A conversa parou e ninguém
// voltou a puxá-la.
//
// Agora a pergunta é a mesma que o score `conducao_entregue` faz, pela MESMA
// função (`@/lib/agent/conducao`): o turno entregou algo a que reagir? Não
// entregou → pendência marcada → o watchdog tem o que reabrir.
//
// O erro tinha as DUAS pontas, e a segunda é a que aparece primeiro ao rodar
// estes testes contra o código antigo: como `state.gate` fica indefinido sempre
// que `decideShowGate` diz não, o predicado por rota marcava pendência até
// quando o agente TINHA perguntado — e o watchdog voltava cobrando em cima da
// pergunta dele. Falso positivo de um lado, cego do outro.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Pós-reveal com a experiência já respondida: o gate ativo é `timeframe`, e
 * `decideShowGate` NÃO o mostra neste turno — ou seja, o funil confia a condução
 * inteiramente à fala do modelo. É a janela onde o defeito mora, e por isso o
 * cenário não usa o turno do reveal (lá a rede da âncora já devolve o gate). */
const CONDUCAO_NA_MAO_DO_MODELO = {
	currentPersona: "auto" as const,
	currentCategory: "auto" as const,
	desireAsked: true,
	desireAnswered: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "first" as const,
	// Já saiu — senão o card de tópicos entra neste turno, e ele CONDUZ de
	// verdade (pede uma escolha). O cenário precisa do turno em que nada pede
	// resposta.
	topicPickerDispatched: true,
	qualifyAnswers: { creditMin: 108_000, creditMax: 120_000 },
};

describeIfDb("pendência do watchdog é marcada por ENTREGA", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("turno que fala sem conduzir deixa pendência para o watchdog", async () => {
		const r = await runScenario({
			metaInicial: CONDUCAO_NA_MAO_DO_MODELO,
			turns: [
				{
					user: "entendi",
					// Fala social: educada, verdadeira, e não pede nada. É a classe de
					// turno que passa em todo juiz de prosa e mata a venda.
					beats: [{ text: "Que bom que ficou claro." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.pendingGate).toBeTruthy();
		expect(r.meta.pendingGateSince).toBeTruthy();
	});

	it("turno que pergunta NÃO deixa pendência — não se cobra quem já conduziu", async () => {
		const r = await runScenario({
			metaInicial: CONDUCAO_NA_MAO_DO_MODELO,
			turns: [
				{
					user: "entendi",
					beats: [{ text: "Perfeito. Você já fez consórcio antes?" }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.pendingGate).toBeFalsy();
	});
});
