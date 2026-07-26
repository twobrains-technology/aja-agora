// FIX-383 — o guardrail aritmético da jornada MADALENA
// (mock `aja-dois-cenarios_3.html`, cenário 1).
//
// ⚠️ O QUE ESTE CENÁRIO **NÃO** FAZ: travar a coreografia do mock. A ordem em
// que o agente elogia o Corolla, pergunta o "por que agora", ou em quantos
// balões ele quebra a explicação é do MODELO — engessar isso produziria
// exatamente o formulário de balões que este produto combate (CLAUDE.md).
//
// O que ELE FAZ é provar a única coisa do mock que é aritmética, e portanto
// código. O mock enuncia assim:
//
//   "Na carta de R$ 120 mil, o embutido te deixaria com uns R$ 86 mil — e o
//    Corolla é R$ 120 mil, não fecharia. Pra sua estratégia de ir juntando, o
//    ideal é uma carta de R$ 171 mil, onde o embutido cheio ainda te entrega
//    os ~R$ 120 mil."
//
// O embutido sai da PRÓPRIA carta. Numa carta do tamanho do bem, o cliente é
// contemplado e falta dinheiro pra comprar o bem — o pior desfecho possível,
// porque só aparece no fim. O remédio não é encolher o que ele quer: é buscar
// grupos de carta MAIOR e deixar o embutido encolher aquilo até entregar o que
// ele precisa (`advance.ts:176`, `bem / (1 - pct)`).
//
// Isso é invariante de negócio: se algum dia a conta mudar de lado, um cliente
// fecha um consórcio que não compra o carro dele.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Madalena no ponto exato do mock: Corolla de R$ 120 mil, reveal já feito,
 * experiência respondida, e o gate do embutido aberto. */
const MADALENA_NO_EMBUTIDO = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "auto" as const,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "first" as const,
	qualifyAnswers: {
		creditMax: 120_000,
		prazoMeses: 12,
		hasLance: "yes" as const,
		lanceValue: 0,
		// Ela não tem reserva; junta R$ 4 mil/mês (o traço do cenário).
		monthlySavings: 4_000,
	},
};

describeIfDb("FIX-383 — embutido não pode entregar crédito menor que o bem", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("aceitar o embutido move o alvo da busca pra uma carta MAIOR", async () => {
		const { busca, faixas } = espiaFaixas();
		const r = await runScenario({
			busca,
			metaInicial: MADALENA_NO_EMBUTIDO,
			turns: [
				{
					user: "isso, quero sim o lance embutido",
					intent: "ready_to_proceed",
					beats: [{ text: "Fechado, deixa eu montar a estratégia com os números reais." }],
				},
			],
		});
		criadas.push(r.conversationId);

		const bem = 120_000;
		const alvo = r.meta.qualifyAnswers?.creditMax ?? 0;

		// A conta do mock: 120.000 / 0,7 = 171.428. O alvo TEM que subir — uma
		// carta do tamanho do bem não fecha depois do embutido.
		expect(alvo).toBeGreaterThan(bem);
		expect(alvo).toBe(Math.round(bem / 0.7));

		// E o preço do BEM não pode se perder: é ele que o cliente precisa receber
		// no fim, e é o número que o agente usa pra conferir se a carta fecha.
		expect(r.meta.qualifyAnswers?.valorDoBemAlvo).toBe(bem);

		// A busca que rodar depois disso tem que ser na faixa NOVA — se ainda
		// fosse na de 120 mil, o ranking poderia recomendar exatamente a carta
		// que não serve.
		if (faixas.length > 0) {
			expect(Math.max(...faixas)).toBeGreaterThan(bem);
		}
	});

	it("recusar o embutido mantém o alvo no preço do bem", async () => {
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: MADALENA_NO_EMBUTIDO,
			turns: [
				{
					user: "não, prefiro sem embutido",
					beats: [{ text: "Sem problema." }],
				},
			],
		});
		criadas.push(r.conversationId);

		// Sem esta metade, o fix viraria "sempre inflar a carta" — e quem não quer
		// embutido acabaria num consórcio maior do que pediu.
		expect(r.meta.qualifyAnswers?.creditMax).toBe(120_000);
		expect(r.meta.qualifyAnswers?.lanceEmbutido).toBe(false);
	});
});

/** Registra as faixas de crédito pedidas à administradora — é o que mostra em
 * qual valor a busca de fato aconteceu. */
function espiaFaixas() {
	const faixas: number[] = [];
	const base = buscaDoMock(96);
	const busca: typeof base = async (args) => {
		if (typeof args.creditMax === "number") faixas.push(args.creditMax);
		return base(args);
	};
	return { busca, faixas };
}
