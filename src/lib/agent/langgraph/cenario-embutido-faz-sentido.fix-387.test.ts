// FIX-387 — a jornada do BERNARDO no ponto em que ela quebrou ao vivo.
//
// Rodada 2026-07-29 (achados do grupo AJA AGORA + Twobrains, 28/07 16:07 —
// print `2807-1607-bernardo-06-nao-apresentou-carta-1-milhao.jpg`).
//
// Ele testava um imóvel de R$ 700 mil com R$ 200 mil de lance próprio. O agente
// explicou o embutido CERTO, e até acertou a aritmética na fala:
//
//   "Se você quer R$ 700 mil no final, a gente precisa buscar uma carta MAIOR
//    — tipo R$ 1 milhão. Faz sentido pra você?"
//
// 700.000 / (1 - 0,30) = 1.000.000. A prosa estava correta. O cliente respondeu
// "faz sentido" — e o turno seguinte foi "Vamos confirmar seu plano", com a
// MESMA carta de R$ 721 mil de antes. Ele concordou com um plano que o agente
// nunca foi buscar; se aquilo virasse contrato, ele contemplaria e faltaria
// dinheiro pra comprar o imóvel — exatamente o desfecho que o FIX-383 existe
// pra impedir.
//
// Por que o FIX-383 (que já cobre "aceitar o embutido move o alvo") passava
// verde com este bug vivo: o cenário dele aceita com `user: "isso, quero sim o
// lance embutido"` — texto que casa com DUAS palavras da lista de SIM. Nenhum
// cliente fala assim. Este cenário é o mesmo invariante, alcançado pela porta
// que um humano usa de verdade: uma afirmação natural.
//
// ⚠️ NÃO se asserta texto nenhum aqui. O que se cobra é aritmética de carta —
// código, não conversa.
import { afterAll, describe, expect, it } from "vitest";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT } from "@/lib/agent/qualify-config";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const BEM = 700_000;
/** A conta do produto: a carta precisa ser grande o bastante pra que, DEPOIS de
 * o embutido comer 30% dela, ainda sobrem os R$ 700 mil do imóvel. */
const CARTA_QUE_ENTREGA_O_BEM = Math.round(BEM / (1 - LANCE_EMBUTIDO_DEFAULT_PERCENT / 100));

/** Bernardo no ponto do print: reveal feito, experiência respondida, tem
 * R$ 200 mil de lance próprio, e o gate do embutido aberto. */
const BERNARDO_NO_EMBUTIDO = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "imovel" as const,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "returning" as const,
	qualifyAnswers: {
		creditMax: BEM,
		prazoMeses: 12,
		hasLance: "yes" as const,
		lanceValue: 200_000,
	},
};

describeIfDb("FIX-387 — aceitar o embutido com afirmação natural move a carta", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("'faz sentido' move o alvo pra carta que entrega o bem (as palavras do Bernardo)", async () => {
		const { busca, faixas } = espiaFaixas();
		const r = await runScenario({
			busca,
			metaInicial: BERNARDO_NO_EMBUTIDO,
			turns: [
				{
					user: "faz sentido",
					intent: "ready_to_proceed",
					beats: [{ text: "Perfeito, deixa eu buscar nessa faixa." }],
				},
			],
		});
		criadas.push(r.conversationId);

		// O aceite tem que ter sido REGISTRADO — sem isto o gate reabre e o
		// cliente responde a mesma pergunta de novo.
		expect(r.meta.qualifyAnswers?.lanceEmbutido).toBe(true);

		// E o alvo tem que ter subido pros R$ 1 milhão que o agente prometeu na
		// fala. Se continuar em 700 mil, o embutido come 30% e entrega 490 mil.
		expect(r.meta.qualifyAnswers?.creditMax).toBe(CARTA_QUE_ENTREGA_O_BEM);
		expect(CARTA_QUE_ENTREGA_O_BEM).toBe(1_000_000); // ancora a conta do print

		// O preço do bem não pode se perder: é o que ele precisa receber no fim.
		expect(r.meta.qualifyAnswers?.valorDoBemAlvo).toBe(BEM);

		// A busca seguinte tem que acontecer na faixa NOVA — senão o ranking pode
		// recomendar de novo justamente a carta que não fecha.
		if (faixas.length > 0) {
			expect(Math.max(...faixas)).toBeGreaterThan(BEM);
		}
	});

	it.each(["por mim tá ótimo", "concordo", "perfeito"])(
		"outras afirmações naturais também movem a carta: %s",
		async (fala) => {
			const r = await runScenario({
				busca: buscaDoMock(96),
				metaInicial: BERNARDO_NO_EMBUTIDO,
				turns: [{ user: fala, intent: "ready_to_proceed", beats: [{ text: "Fechado." }] }],
			});
			criadas.push(r.conversationId);
			expect(r.meta.qualifyAnswers?.lanceEmbutido).toBe(true);
			expect(r.meta.qualifyAnswers?.creditMax).toBe(CARTA_QUE_ENTREGA_O_BEM);
		},
	);

	// ── A metade que impede o fix de virar "sempre inflar a carta" ──

	it("recusa explícita continua mantendo o alvo, mesmo com intent de avanço", async () => {
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: BERNARDO_NO_EMBUTIDO,
			turns: [
				{
					// O intent vem "de avanço" DE PROPÓSITO: é o caso perigoso, em que o
					// analyzer leu a intenção como seguir adiante mas o cliente disse não.
					// O texto tem que vencer — vender embutido pra quem recusou é o erro
					// caro (advance.ts:159-163).
					user: "não, prefiro usar só o meu dinheiro",
					intent: "ready_to_proceed",
					beats: [{ text: "Sem problema." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.qualifyAnswers?.lanceEmbutido).toBe(false);
		expect(r.meta.qualifyAnswers?.creditMax).toBe(BEM);
	});

	it("fala que não afirma nada NÃO vira aceite — o gate segue aberto", async () => {
		// Depois do FIX-395b o SIM é LÉXICO, não vem do rótulo do analyzer: então
		// "faz sentido" aceita com qualquer intent (é o certo — o gate perguntou
		// exatamente isso). O que continua tendo de ficar indefinido é a fala que
		// não afirma: aí o gate reabre em vez de mover a carta.
		//
		// Este caso substituiu um que asseverava "faz sentido" + intent neutro =
		// indefinido. Aquela asserção só existia porque a 1ª versão do fix fazia o
		// aceite depender do rótulo; virou obsoleta quando a regra em bloco caiu.
		for (const fala of ["hmm", "sei lá", "prefiro usar só o meu dinheiro"]) {
			const r = await runScenario({
				busca: buscaDoMock(96),
				metaInicial: BERNARDO_NO_EMBUTIDO,
				turns: [{ user: fala, beats: [{ text: "Deixa eu confirmar." }] }],
			});
			criadas.push(r.conversationId);
			expect(r.meta.qualifyAnswers?.lanceEmbutido, fala).toBeUndefined();
			expect(r.meta.qualifyAnswers?.creditMax, fala).toBe(BEM);
		}
	});
});

/** Registra as faixas de crédito pedidas à administradora — mostra em qual valor
 * a busca de fato aconteceu. */
function espiaFaixas() {
	const faixas: number[] = [];
	const base = buscaDoMock(96);
	const busca: typeof base = async (args) => {
		if (typeof args.creditMax === "number") faixas.push(args.creditMax);
		return base(args);
	};
	return { busca, faixas };
}
