// FIX-399c — o repro exato da 2ª revisão, agora como teste de jornada.
//
// 2ª revisão independente entregou este repro pronto e o autor confirmou o guard
// À MÃO, sem virar teste. 3ª revisão apontou: revertendo `qualify-state.ts`
// inteiro pra HEAD (some `declines` do enum E os 3 guards de `decideShowGate`),
// a suíte inteira continua verde — 45/45 jornada, 1869/1869 unit. Nenhum arquivo
// provava o comportamento; ele só existia porque alguém confiou no código lido.
//
// O que este teste prova: cliente com ESCOLHA já ancorada (a Bevi cobrou o CPF,
// a oferta está na mesa) recusa por preço — sem a palavra "não" — e o formulário
// de contratação NÃO aparece. A trilha antiga, com o rótulo ausente, era
// ["text","gate:contract","artifact:contract_form"]: formulário de contratação
// na cara de quem acabou de recusar.
import { afterAll, describe, expect, it } from "vitest";
import { buscaDoMock } from "./testing/grupos-do-mock";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Escolha já ancorada — é o estado em que `gate === "contract"` (o formulário de
 * contratação é o próximo passo natural, SE o cliente não tiver acabado de
 * recusar). */
const COM_ESCOLHA_ANCORADA = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "imovel" as const,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "returning" as const,
	recoConsentAnswered: true,
	simulatorOfferDispatched: true,
	decisionDispatched: true,
	qualifyAnswers: {
		creditMax: 700_000,
		prazoMeses: 12,
		hasLance: "yes" as const,
		lanceValue: 200_000,
		lanceEmbutido: false,
	},
	recommendedOffer: {
		administradora: "Itaú",
		creditValue: 721_000,
		termMonths: 221,
		monthlyPayment: 4_430.98,
	},
	escolha: {
		administradora: "Itaú",
		creditValue: 721_000,
		termMonths: 221,
		monthlyPayment: 4_430.98,
		origem: "afirmacao" as const,
	},
};

describeIfDb("FIX-399c — recusa rotulada NÃO abre o formulário de contratação", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it.each(["achei caro, prefiro usar só o meu dinheiro", "de jeito nenhum", "não quero mais"])(
		"'%s' rotulada declines não emite contract_form",
		async (fala) => {
			const r = await runScenario({
				busca: buscaDoMock(96),
				metaInicial: COM_ESCOLHA_ANCORADA,
				turns: [{ user: fala, intent: "declines", beats: [{ text: "Entendido." }] }],
			});
			criadas.push(r.conversationId);

			const trilha = r.turns.flatMap((t) => t.trilha);
			expect(trilha, fala).not.toContain("artifact:contract_form");
			expect(trilha, fala).not.toContain("gate:contract");
		},
	);

	it("aceite continua liberando o formulário (o guard não pode esvaziar o gate)", async () => {
		const r = await runScenario({
			busca: buscaDoMock(96),
			metaInicial: COM_ESCOLHA_ANCORADA,
			turns: [{ user: "pode seguir", intent: "ready_to_proceed", beats: [{ text: "Perfeito." }] }],
		});
		criadas.push(r.conversationId);

		const trilha = r.turns.flatMap((t) => t.trilha);
		expect(trilha).toContain("artifact:contract_form");
	});
});
