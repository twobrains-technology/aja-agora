// Busca vazia é um FATO com consequências — não um não-evento.
//
// Produção, `fa0533a0-…` (13/08/2026). O funil buscou a MESMA faixa impossível
// quatro turnos seguidos (R$ 9.120 → vazio → R$ 6.424 → vazio → …). Dois
// buracos, os dois aqui:
//
//   1. **Sem freio.** O ramo de busca vazia não atualizava o snapshot do alvo
//      (`discoveredCreditTarget`), então a condição que re-dispara a descoberta
//      — "o alvo atual diverge do último buscado" — nunca cicatrizava. Cada
//      turno redisparava a mesma pergunta impossível para a Bevi.
//   2. **Âncora podre.** `recommendedOffer` continuava com a oferta de três
//      faixas atrás. Foi ela que fez o contexto do modelo AFIRMAR, no último
//      turno, que "as ofertas REAIS já foram buscadas e os cards estão na tela:
//      BANCO DO BRASIL, R$ 201.393" — numa conversa em que a última busca tinha
//      voltado vazia. A rede que existe para este caso (`blocoBuscaVazia`, o
//      bloco de contexto que proíbe dizer que encontrou opções) estava
//      desarmada justamente porque a condição dela é "não tem oferta".
//
// A "alucinação" do agente estava literal no contexto que o servidor montou.
// Por isso o conserto é de estado, não mordaça na fala.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** A Bevi respondendo corretamente que aquela faixa não tem oferta nenhuma. */
function buscaVazia() {
	const chamadas: Array<Record<string, unknown>> = [];
	const busca = async (args: Record<string, unknown>) => {
		chamadas.push(args);
		return { recommendations: [] };
	};
	return { busca, chamadas };
}

const OFERTA_STALE = {
	groupId: "6a7b59c125935b16a73163e6",
	administradora: "BANCO DO BRASIL",
	category: "moto" as const,
	creditValue: 201_393,
	monthlyPayment: 6_270.48,
	termMonths: 44,
};

describeIfDb("busca vazia tem consequência", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("não repete a MESMA busca impossível turno após turno", async () => {
		const { busca, chamadas } = buscaVazia();
		const r = await runScenario({
			busca: busca as never,
			metaInicial: {
				desireAsked: true,
				desireAnswered: true,
				identityCollected: true,
				currentCategory: "moto" as const,
				qualifyAnswers: { creditMax: 20_000, creditMin: 18_000 },
			},
			turns: [
				{
					user: "quero ver as opções",
					intent: "ready_to_proceed",
					beats: [{ text: "Vou buscar." }],
				},
				{ user: "e aí, achou?", intent: "asking_question", beats: [{ text: "Deixa eu ver." }] },
				{ user: "e agora?", intent: "asking_question", beats: [{ text: "Um instante." }] },
			],
		});
		criadas.push(r.conversationId);

		// Um retry é legítimo — a Bevi cai de verdade, e é também o gatilho do
		// FIX-380 para o funil trocar de estratégia e voltar a pedir o valor. O que
		// não pode é martelar a mesma faixa impossível a cada turno, que foi o que
		// consumiu a conversa de produção.
		expect(
			chamadas.length,
			`buscou ${chamadas.length}× a mesma faixa: ${JSON.stringify(chamadas)}`,
		).toBeLessThanOrEqual(2);
	});

	it("busca vazia invalida a oferta ancorada — o contexto não pode afirmar o que não existe", async () => {
		const { busca } = buscaVazia();
		const r = await runScenario({
			busca: busca as never,
			metaInicial: {
				desireAsked: true,
				desireAnswered: true,
				identityCollected: true,
				currentCategory: "moto" as const,
				revealCompleted: true,
				// A oferta de uma faixa anterior, ainda ancorada no estado.
				recommendedOffer: OFERTA_STALE,
				recommendedAdministradora: "BANCO DO BRASIL",
				qualifyAnswers: { creditMax: 20_000, creditMin: 18_000 },
			},
			turns: [
				{
					user: "quero ver o que cabe pra mim",
					intent: "ready_to_proceed",
					beats: [{ text: "Deixa eu buscar." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.recommendedOffer).toBeUndefined();
		expect(r.meta.recommendedAdministradora).toBeUndefined();
	});
});
