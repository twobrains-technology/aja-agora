// @vitest-environment happy-dom

// FIX-391 — o percentual do "Cenário com lance" é do GRUPO, não do cliente.
//
// Rodada 2026-07-29 (grupo AJA AGORA + Twobrains, 28/07 16:03 — print
// `2807-1603-bernardo-03-insiste-lance-80-tendo-200k.jpg`). O Bernardo declarou
// R$ 200 mil de lance para uma carta de R$ 721 mil. O card mostrou:
//
//   CENÁRIO COM LANCE
//   Com lance de 87.57% do valor do bem, expectativa de contemplação em ~6
//   meses (estimativa, não garantia).
//   Lance estimado p/ contemplar   R$ 631.379,70
//
// …e o agente narrou: "com R$ 200 mil de lance próprio, você recebe R$ 721 mil
// (…) com um lance bem agressivo (quase 88% da carta), você contemplaria em
// torno de 6 meses". Ele resumiu como "o agente tá insistindo na carta com
// lances de 80% mesmo eu tendo dito que só tenho 200k".
//
// A conta: R$ 631.379,70 / R$ 721.000 = 87,57%. Os R$ 200 mil dele são 27,7%.
// O percentual NUNCA foi dele — vem de `offer-mapper.ts:245`
// (`lancePercent = offer.bidPercentage * 100`, o nível de lance da OFERTA na
// Bevi), e o `expectedTermMonths` (~6 meses) é a expectativa PARA AQUELE nível.
//
// Culpar a prosa do modelo aqui seria injusto e, pior, inútil: a frase do card
// não tem sujeito. "Com lance de 87,57% (…) expectativa de contemplação em ~6
// meses" convida o leitor a se colocar como autor daquele lance. O `blocoLance`
// (converse.ts:456) até proíbe vender contemplação rápida quando a conta não
// fecha — mas o CARD passava por fora desse guard.
//
// Número comparativo sem premissa explícita é o que este repo já trata como
// defeito (D11 / CDC art. 37, mesma régua do disclaimer de financiamento). Copy
// de card é CÓDIGO — então tem teste.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimulationResultPayload } from "@/lib/chat/types";
import { SimulationResult } from "./simulation-result";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), sendUserMessage: vi.fn(), status: "ready" }),
}));

/** Os números exatos do print do Bernardo. */
const payload: SimulationResultPayload = {
	groupId: "grp-itau-721",
	administradora: "ITAÚ",
	category: "imovel",
	creditValue: 721_000,
	monthlyPayment: 4_430.98,
	adminFee: 129_780,
	reserveFund: 21_630,
	insurance: 0,
	totalCost: 979_246.58,
	termMonths: 221,
	effectiveRate: 35.8,
	lanceScenario: { lancePercent: 87.57, expectedTermMonths: 6 },
	embeddedBid: {
		percent: 30,
		embeddedBidValue: 216_300,
		receivedCredit: 504_700,
		necessaryBidToContemplate: 631_379.7,
	},
};

function textoDoCenario(): string {
	render(<SimulationResult payload={payload} />);
	const bloco = screen.getByTestId("cenario-com-lance");
	return (bloco.textContent ?? "").replace(/\s+/g, " ");
}

describe("FIX-391 — cenário com lance atribui o percentual ao grupo", () => {
	afterEach(cleanup);

	it("a frase ancora o percentual NO GRUPO, não no leitor", () => {
		const texto = textoDoCenario();
		// Tem que ficar explícito de quem é o lance. Sem isto, "Com lance de
		// 87,57%" lê como "se VOCÊ der 87,57%" — e foi assim que o agente leu.
		expect(texto.toLowerCase()).toMatch(/neste grupo|nesse grupo|deste grupo|desse grupo/);
	});

	it("não abre com construção sem sujeito ('Com lance de X%…')", () => {
		// Revisão independente (2026-07-30) mostrou que as duas asserções que
		// estavam aqui eram CÓDIGO MORTO: uma regex ancorada em "Cenário com lance
		// Com lance de…" que nunca casava (o `textContent` cola os elementos sem
		// espaço) e um `not.toMatch(/você contemplaria/)` de uma frase que nunca
		// esteve no card — era prosa do agente. Passavam com e sem o bug.
		//
		// A checagem real: o parágrafo do cenário não pode COMEÇAR por "com lance
		// de", que é a construção sem sujeito que fazia o leitor se apropriar do
		// percentual. Normaliza a fronteira dos elementos antes de comparar.
		render(<SimulationResult payload={payload} />);
		const paragrafo = screen
			.getByTestId("cenario-com-lance")
			.querySelectorAll("p")[1] as HTMLParagraphElement;
		const inicio = (paragrafo.textContent ?? "").trim().toLowerCase();
		expect(inicio).not.toMatch(/^com lance de/);
		expect(inicio).toMatch(/^neste grupo/);
	});

	it("o percentual é da CARTA, não do bem — é sobre isso que a conta fecha", () => {
		// 631.379,70 / 721.000 = 87,57% (o número do print). Sobre o BEM de
		// R$ 700 mil daria 90,20%. Os dois divergem justamente quando há embutido,
		// que é o cenário deste card — então o rótulo errado desalinha a conta do
		// cliente. `bidPercentage` é "lance TOTAL necessário" (offer-mapper.ts:42).
		const texto = textoDoCenario().toLowerCase();
		expect(texto).toMatch(/da carta|de cr[ée]dito/);
		expect(texto).not.toMatch(/do valor do bem/);
	});

	it("não afirma FREQUÊNCIA de contemplação (o campo não sustenta)", () => {
		// "o lance que COSTUMA contemplar" era uma claim frequentista sobre um campo
		// que só diz o lance necessário. Mesma classe do `taxaContemplacao`, que o
		// repo proíbe citar por semântica não documentada.
		const texto = textoDoCenario().toLowerCase();
		expect(texto).not.toMatch(/costuma|na m[ée]dia|normalmente|geralmente/);
	});

	it("segue mostrando o lance necessário em reais (a premissa não pode sumir)", () => {
		const texto = textoDoCenario();
		expect(texto).toMatch(/631\.379/);
		expect(texto.toLowerCase()).toMatch(/lance estimado p\/ contemplar/);
	});

	it("mantém o percentual e o prazo reais — o fix é de atribuição, não de número", () => {
		const texto = textoDoCenario();
		expect(texto).toMatch(/87[.,]57%/);
		expect(texto).toMatch(/6 meses/);
		expect(texto.toLowerCase()).toMatch(/estimativa, não garantia/);
	});

	it("sem lanceScenario o bloco não existe (nada de card meio-vazio)", () => {
		const semCenario = { ...payload, lanceScenario: undefined };
		render(<SimulationResult payload={semCenario as SimulationResultPayload} />);
		expect(screen.queryByTestId("cenario-com-lance")).toBeNull();
	});
});
