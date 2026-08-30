/**
 * A directive do gate `identify` não pode mandar o modelo mentir.
 *
 * `GATE_INTENT.identify` instruía: *"diga POR QUE precisa (a administradora exige
 * pra trazer as ofertas reais)"*. Era verdade enquanto o gate morava antes da
 * busca. Com a vitrine ele acontece **depois** de as cartas estarem na tela — e
 * essa frase passa a ser falsa exatamente no clique que fecha a venda.
 *
 * O detalhe que torna isto pior que uma copy esquecida: a directive é a
 * autoridade mais ESPECÍFICA na janela do modelo naquele turno. As outras copies
 * (card, gate, beat do WhatsApp) já tinham sido corrigidas; esta continuava
 * ensinando o oposto, e ganharia da regra geral.
 */
import { afterEach, describe, expect, it } from "vitest";
import { buildSystemContext, gateIntent } from "./system-context";

const ENV_ORIGINAL = { ...process.env };

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describe("gateIntent('identify')", () => {
	it("com a vitrine ligada, NÃO diz que a administradora exige para trazer ofertas", () => {
		process.env.VITRINE_CPF = "11144477735";
		process.env.VITRINE_CELULAR = "62992496793";

		const d = gateIntent("identify") ?? "";
		expect(d).not.toContain("trazer as ofertas reais");
		// e continua sendo uma directive útil: pede o dado e explica a LGPD
		expect(d).toContain("CPF");
		expect(d).toContain("LGPD");
	});

	it("sem vitrine, volta a justificativa antiga — que ali é verdadeira", () => {
		process.env.VITRINE_CPF = "";
		process.env.VITRINE_CELULAR = "";

		expect(gateIntent("identify") ?? "").toContain("trazer as ofertas reais");
	});

	it("o caminho do cliente CONFUSO usa a mesma copy — não o mapa cru", () => {
		// Segundo leitor de `GATE_INTENT`, que escapou na primeira correção
		// (`buildSystemContext`, ramo `confusedAboutGate`). Quem não entendeu é
		// exatamente quem mais ouviria a justificativa errada.
		process.env.VITRINE_CPF = "11144477735";
		process.env.VITRINE_CELULAR = "62992496793";

		const ctx = buildSystemContext({
			knownName: "Paulo",
			newlyExtractedExperience: null,
			meta: { qualifyAnswers: {} } as never,
			confusedAboutGate: "identify",
		} as never);
		const texto = ctx.map((m) => m.content).join(" ");
		expect(texto).not.toContain("trazer as ofertas reais");
	});

	it("mantém a proibição de fazer uma segunda pergunta no turno", () => {
		// FIX do Bernardo (28/07): "quanto conseguiria dar de entrada?" no mesmo
		// turno do formulário. Vale nos dois mundos.
		process.env.VITRINE_CPF = "11144477735";
		process.env.VITRINE_CELULAR = "62992496793";

		expect(gateIntent("identify") ?? "").toMatch(/NÃO pergunte mais nada/i);
	});
});
