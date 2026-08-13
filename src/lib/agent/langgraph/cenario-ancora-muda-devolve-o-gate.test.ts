// Turno de reveal que não conduz devolve a pergunta do funil.
//
// No turno da busca o funil SUPRIME o gate de propósito: os cards acabaram de
// cair na tela e quem fecha o turno é a âncora — a frase curta que convida o
// cliente a reagir ao que está vendo ("qual delas te chamou a atenção?"). É a
// decisão certa: gate e âncora juntos dariam duas perguntas no mesmo turno.
//
// Só que as duas redes dependiam uma da outra e caíam juntas. Se a âncora não
// entrega texto — o beat morre em `<thinking>`, o filtro poda tudo, o modelo
// persegue uma tool que não existe — o gate já tinha sido suprimido e o cliente
// fica olhando cinco cards, sem nada convidando a responder. Foi o desfecho da
// sessão `ff8f2080` (produção 2026-08-13): "Excelente, Kairo! Um instante." e
// silêncio.
//
// A regra passa a ser: o gate só é suprimido se a âncora REALMENTE conduziu.
// Não conduziu, o funil retoma a palavra com a pergunta canônica que ele já
// tem — no mesmo turno, sem timer e sem uma segunda chamada de modelo (o
// re-beat foi medido e descartado: disparava em 19 de 19 cenários e comia a
// chamada da tool; ver `converse.ts`, "AQUI MORAVA UMA RECUPERAÇÃO DE TURNO
// MUDO QUE EU REMOVI").
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Duas opções — com uma só, o guard de opção única suprime a recomendação e o
 * turno deixa de ser um reveal. */
const buscaComDuasOpcoes = async () => ({
	recommendations: [
		{
			id: "grupo-itau",
			administradora: "ITAÚ",
			category: "auto",
			creditValue: 241_258,
			monthlyPayment: 6_204.66,
			termMonths: 47,
			availableSlots: 8,
			rank: 0,
		},
		{
			id: "grupo-canopus",
			administradora: "CANOPUS",
			category: "auto",
			creditValue: 240_000,
			monthlyPayment: 2_577.46,
			termMonths: 116,
			availableSlots: 2,
			rank: 1,
		},
	],
});

const META_DO_REVEAL = {
	desireAsked: true,
	desireAnswered: true,
	identityCollected: true,
	currentCategory: "auto" as const,
	qualifyAnswers: { creditMin: 214_200, creditMax: 238_000 },
};

describeIfDb("reveal sem âncora devolve o gate", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("âncora muda: o funil retoma a palavra no mesmo turno", async () => {
		const r = await runScenario({
			busca: buscaComDuasOpcoes as never,
			metaInicial: META_DO_REVEAL,
			turns: [
				{
					user: "Enviei meus dados pra buscar as ofertas",
					// UM beat só. O beat da âncora, que vem depois, cai no fallback do
					// modelo roteirizado — texto vazio, exatamente como o beat que
					// morreu em `<thinking>` na produção.
					beats: [{ text: "Excelente, Kairo!" }],
				},
			],
		});
		criadas.push(r.conversationId);

		const eventos = r.turns[0]?.events ?? [];
		// Os cards saíram — o turno não foi vazio, o que sempre confundiu o
		// diagnóstico: havia o que ver, faltava o que responder.
		expect(eventos.some((e) => e.type === "artifact")).toBe(true);
		// E o cliente TEM que ter recebido algo a que reagir.
		expect(eventos.some((e) => e.type === "gate")).toBe(true);
	});

	it("âncora que conduz continua suprimindo o gate — sem pergunta dupla", async () => {
		const r = await runScenario({
			busca: buscaComDuasOpcoes as never,
			metaInicial: META_DO_REVEAL,
			turns: [
				{
					user: "Enviei meus dados pra buscar as ofertas",
					beats: [
						{ text: "Excelente, Kairo!" },
						// A âncora fez o trabalho dela: fala curta e convite a reagir.
						{ text: "Alguma dessas te chamou mais atenção?" },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const eventos = r.turns[0]?.events ?? [];
		expect(eventos.some((e) => e.type === "artifact")).toBe(true);
		// Sem esta metade, o conserto acima viraria duas perguntas no mesmo turno.
		expect(eventos.some((e) => e.type === "gate")).toBe(false);
	});
});
