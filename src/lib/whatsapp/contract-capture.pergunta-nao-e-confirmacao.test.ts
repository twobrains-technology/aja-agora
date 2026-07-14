import { describe, expect, it } from "vitest";
import { decideConfirmStage } from "./contract-capture";

// ============================================================================
// FIX-357 — pergunta do cliente EVAPORAVA no gate de confirmação
// ----------------------------------------------------------------------------
// Achado do juiz (rodada final, 3 dossiês WhatsApp): no estágio "confirm", se o
// texto do usuário não batia no regex de aceite (`AFFIRM_RE`), o turno NUNCA
// chegava ao LLM — caía direto num texto fixo:
//
//     USUÁRIO: tem Bradesco?
//     AGENTE:  Só pra confirmar: posso seguir e criar sua proposta com a
//              administradora? Responde *sim* pra fechar ou *ver outras*...
//
// A pergunta do cliente simplesmente EVAPORA. É o mesmo antipadrão que esta
// campanha inteira existe pra matar (ADR 2026-07-13): o servidor respondendo por
// texto pré-fabricado, sem consultar o modelo.
//
// Regra: se o texto não é aceite NEM recusa, ele não é uma resposta à
// confirmação — é OUTRA COISA (uma pergunta, uma dúvida). Quem responde é o
// MODELO. O invariante continua intacto: só aceite EXPLÍCITO dispara a proposta
// (que faz consulta de bureau) — uma pergunta jamais fecha contrato.
// ============================================================================

describe("gate de confirmação: pergunta do cliente vai pro MODELO, não pro texto fixo", () => {
	const PERGUNTAS = [
		"tem Bradesco?",
		"e se eu atrasar uma parcela?",
		"qual a taxa de administração?",
		"por que essa e não outra?",
		"quanto tempo até eu ser contemplado?",
	];

	for (const texto of PERGUNTAS) {
		it(`"${texto}" NÃO é resposta de confirmação → o agente responde`, () => {
			const r = decideConfirmStage(texto);
			expect(
				r.handled,
				`"${texto}" é uma PERGUNTA. Tratá-la como resposta ambígua e cuspir "Só pra confirmar: posso seguir?" faz a dúvida do cliente evaporar — foi o achado do juiz em 3 jornadas.`,
			).toBe(false);
		});
	}

	it("aceite EXPLÍCITO continua disparando a proposta (invariante)", () => {
		const r = decideConfirmStage("sim, pode fechar");
		expect(r.handled).toBe(true);
		if (r.handled) expect(r.outcome).toBe("fire");
	});

	it("recusa continua sendo recusa", () => {
		const r = decideConfirmStage("não, quero ver outras");
		expect(r.handled).toBe(true);
		if (r.handled) expect(r.outcome).toBe("cancel");
	});

	it("uma PERGUNTA jamais fecha contrato (nunca vira 'fire')", () => {
		for (const texto of PERGUNTAS) {
			const r = decideConfirmStage(texto);
			if (r.handled) expect(r.outcome).not.toBe("fire");
		}
	});
});
