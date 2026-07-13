// FIX-115 (PROD 2026-06-30) — resiliência do valor do bem.
//
// Requisito literal do Kairo: "se o componente nao aparecer tem que se resolver
// mesmo assim". O valor por CONVERSA (FIX-104) depende do analyzer LLM extrair o
// creditMax — e o analyzer cai em NEUTRAL_FALLBACK (creditMax=null) em timeout de
// cold-start da Anthropic. Sem um backstop DETERMINÍSTICO, "50k" digitado não vira
// número, o gate `credit` re-dispara e o funil TRAVA. Este parser é o backstop:
// puro, sem LLM, cobre as formas comuns que o usuário digita.
import { describe, expect, it } from "vitest";
import { parseAssetValue } from "./parse-asset-value";

describe("FIX-115 — parseAssetValue (backstop determinístico do valor do bem)", () => {
	it("formas exatas do card do bug: 50k / 50 mil / R$ 50.000 => 50000", () => {
		expect(parseAssetValue("50k")).toBe(50000);
		expect(parseAssetValue("50 mil")).toBe(50000);
		expect(parseAssetValue("R$ 50.000")).toBe(50000);
	});

	it("variações de milhar coloquiais", () => {
		expect(parseAssetValue("uns 80 mil")).toBe(80000);
		expect(parseAssetValue("80k")).toBe(80000);
		expect(parseAssetValue("80mil")).toBe(80000);
		expect(parseAssetValue("tipo 150 mil")).toBe(150000);
		expect(parseAssetValue("uns 200 mil então")).toBe(200000);
	});

	it("valor com separador de milhar BR e R$", () => {
		expect(parseAssetValue("R$ 347.500")).toBe(347500);
		expect(parseAssetValue("R$50.000,00")).toBe(50000);
		expect(parseAssetValue("240.000")).toBe(240000);
	});

	it("milhão/milhões", () => {
		expect(parseAssetValue("1 milhão")).toBe(1_000_000);
		expect(parseAssetValue("1,5 milhão")).toBe(1_500_000);
		expect(parseAssetValue("2 milhões")).toBe(2_000_000);
		expect(parseAssetValue("uns 2 mi")).toBe(2_000_000);
	});

	it("decimal em mil/k", () => {
		expect(parseAssetValue("50,5 mil")).toBe(50500);
		expect(parseAssetValue("1.5k")).toBe(1500);
	});

	// NUNCA confundir orçamento mensal com valor do bem — "850 por mês" é parcela,
	// não o valor do carro (system-prompt/turn-analyzer separam os dois).
	it("rejeita orçamento mensal (não é valor do bem)", () => {
		expect(parseAssetValue("R$ 850 por mês")).toBeNull();
		expect(parseAssetValue("850 mensais")).toBeNull();
		expect(parseAssetValue("pago 1000/mês")).toBeNull();
		expect(parseAssetValue("cabe uns 800 no mês")).toBeNull();
	});

	it("texto sem valor => null", () => {
		expect(parseAssetValue("bora continuar")).toBeNull();
		expect(parseAssetValue("não sei ainda")).toBeNull();
		expect(parseAssetValue("")).toBeNull();
	});

	// Número nu pequeno sem marcador (mil/k/R$) é ambíguo demais pra cravar como
	// valor de bem — deixa pro analyzer. Só crava número nu quando é claramente
	// grande (>= 1000, com separador de milhar ou magnitude de bem).
	it("número nu pequeno e ambíguo => null (não crava valor de bem)", () => {
		expect(parseAssetValue("uns 80")).toBeNull();
		expect(parseAssetValue("acho que 3")).toBeNull();
	});
});

// ============================================================================
// FIX-208 (PROD 2026-07-02) — número NU no contexto do gate `credit`.
// ----------------------------------------------------------------------------
// Bug (Kairo, WhatsApp): "Quanto custa o carro?" → usuário responde "200" e o
// agente cai em "Acho que me perdi por aqui. Pode mandar de novo, por favor?".
// parseAssetValue("200")=null POR DESIGN (número nu pequeno é ambíguo fora de
// contexto). MAS respondendo o gate de VALOR, um número nu É o valor: quem diz
// "200" pra um carro quer R$ 200 mil. Com o contexto do gate `credit` + a
// categoria, o parser escala pra milhares quando o literal fica abaixo do piso
// da faixa e clampa na categoria. FORA desse contexto o comportamento NÃO muda
// (segue null — a suíte acima é a prova de não-regressão).
// ============================================================================
describe("FIX-208 — número nu no contexto do gate `credit` vira valor do bem", () => {
	it("o caso EXATO do bug: '200' com gate credit + categoria auto => 200000", () => {
		expect(parseAssetValue("200", { gate: "credit", category: "auto" })).toBe(200_000);
	});

	it("número nu com ruído de fala ('uns 200', 'acho que 200') => 200000 no contexto credit", () => {
		expect(parseAssetValue("uns 200", { gate: "credit", category: "auto" })).toBe(200_000);
		expect(parseAssetValue("acho que 200", { gate: "credit", category: "auto" })).toBe(200_000);
		expect(parseAssetValue("uns 80", { gate: "credit", category: "auto" })).toBe(80_000);
	});

	it("número já em reais crus (>= piso da faixa) é tomado literal, sem escalar", () => {
		expect(parseAssetValue("200000", { gate: "credit", category: "auto" })).toBe(200_000);
		expect(parseAssetValue("80000", { gate: "credit", category: "auto" })).toBe(80_000);
	});

	// FIX-218 (Ata 2026-07-04): o clamp na faixa da categoria foi REVOGADO —
	// o número nu escalado (moto: 200 => 200.000) sobrevive intacto, mesmo
	// muito acima do teto real da moto (a busca acha a ordem de grandeza mais
	// próxima em vez de forçar o valor pro teto do slider).
	it("número nu escalado NÃO clampa mais na faixa da categoria (moto: 200 => 200000)", () => {
		expect(parseAssetValue("200", { gate: "credit", category: "moto" })).toBe(200_000);
	});

	it("SEM contexto de gate credit, número nu segue null (não regride FIX-115)", () => {
		expect(parseAssetValue("200")).toBeNull();
		expect(parseAssetValue("200", { gate: "lance", category: "auto" })).toBeNull();
		expect(parseAssetValue("200", { gate: "credit" })).toBeNull(); // sem categoria, sem faixa
	});

	it("conservador: NÃO crava valor de uma pergunta solta com número (muitas palavras)", () => {
		// "e a taxa de 2%?" no meio da coleta NÃO pode virar creditMax — o número
		// não está ancorado no valor do bem (Lei 4). Só a msg essencialmente-número passa.
		expect(parseAssetValue("e a taxa de 2%?", { gate: "credit", category: "auto" })).toBeNull();
		expect(
			parseAssetValue("quanto fica se eu financiar em 60 vezes", {
				gate: "credit",
				category: "auto",
			}),
		).toBeNull();
	});

	it("orçamento mensal segue rejeitado mesmo no contexto credit (não é valor do bem)", () => {
		expect(parseAssetValue("200 por mês", { gate: "credit", category: "auto" })).toBeNull();
	});
});
