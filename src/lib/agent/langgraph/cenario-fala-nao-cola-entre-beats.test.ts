// A fala de um beat não pode ser engolida pelo preâmbulo do beat anterior.
//
// Produção 2026-08-13, sessão `ff8f2080` — o turno em que o cliente recebeu
// "Excelente, Kairo! Um instante." e cinco cards, sem uma palavra de condução.
//
// O modelo falou TRÊS vezes nesse turno. As duas primeiras eram preâmbulo de
// processo ("Deixa eu buscar as melhores ofertas pro Song Premium de R$ 238 mil
// com parcela de R$ 1.800.") e foram podadas com razão — narrar mecânica de
// ferramenta é exatamente o que o `EphemeralTextFilter` existe para impedir. A
// terceira era fala legítima, e morreu junto. Por quê:
//
//   1. o texto do beat anterior termina em "R$ 1.800." e um "." colado a DÍGITO
//      não é fim de frase, é separador de milhar (`sanitizer.ts:985-991`, FIX-248
//      — sem isso "Juntando R$ 4." | "000,00" virava duas bolhas);
//   2. sem fronteira, o beat inteiro fica retido no `pending` do filtro;
//   3. o beat SEGUINTE chega e cola no que ficou retido — vira UM segmento só,
//      começando por "Deixa eu buscar";
//   4. o segmento inteiro é classificado como preâmbulo e cai — levando a fala
//      boa junto.
//
// O `flushPending()` (FIX-330, `sanitizer.ts:1207-1219`) foi feito exatamente
// para as "fronteiras INTERMEDIÁRIAS do turno (troca de bloco multi-tool-call,
// pré-tool-call)" — e o runtime LangGraph nunca o chamava ali. Cada geração é
// uma fronteira: o que o modelo não fechou numa, não pode vazar para a próxima.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** O texto que o cliente REALMENTE recebeu — só os deltas que passaram no
 * filtro, na ordem em que foram para o stream. */
function falaEntregue(turno: { events: Array<{ type: string; text?: string }> }): string {
	return turno.events
		.filter((e) => e.type === "text-delta")
		.map((e) => e.text ?? "")
		.join("");
}

describeIfDb("fala entregue não cola entre beats", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("preâmbulo terminado em valor não engole a fala do beat seguinte", async () => {
		const r = await runScenario({
			metaInicial: {
				desireAsked: true,
				desireAnswered: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				// Busca já feita: o turno é de conversa, não de descoberta.
				searchDispatched: true,
				revealCompleted: true,
				recommendedOffer: {
					administradora: "ITAÚ",
					category: "auto",
					creditValue: 241_258,
					monthlyPayment: 6_204.66,
					termMonths: 47,
					groupId: "6a7b59c325935b16a73168b5",
				},
				qualifyAnswers: { creditMin: 214_200, creditMax: 238_000 },
			},
			turns: [
				{
					user: "e as ofertas?",
					beats: [
						{
							// Preâmbulo de processo, terminado num VALOR — a combinação exata
							// do incidente. Ele deve ser podado; o problema nunca foi este.
							text: "Deixa eu buscar as melhores ofertas pro Song Premium de R$ 238 mil com parcela de R$ 1.800.",
							toolCalls: [{ name: "ajustar_por_parcela", args: { parcelaDesejada: 1_800 } }],
						},
						{
							// A fala que o cliente precisava ouvir — e que sumiu.
							text: "As opções que apareceram ficam acima dos R$ 1.800 que você falou: a mais leve sai por R$ 2.577 por mês.",
						},
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const entregue = falaEntregue(r.turns[0] as never);
		// O preâmbulo continua podado — não é ele que está em julgamento.
		expect(entregue).not.toContain("Deixa eu buscar");
		// A fala do beat seguinte tem que chegar INTEIRA. Sem o flush na fronteira
		// ela chegava decapitada — o que sobrevivia era só o pedaço depois do
		// primeiro delimitador dela (" a mais leve sai por R$ 2.577 por mês."),
		// porque tudo que vinha antes tinha sido colado no preâmbulo e podado
		// junto. Asserção na PRIMEIRA metade de propósito: era ela que sumia.
		expect(entregue).toContain("As opções que apareceram ficam acima dos R$ 1.800");
		expect(entregue).toContain("R$ 2.577");
	});
});
