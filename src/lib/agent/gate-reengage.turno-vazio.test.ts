import { describe, expect, it } from "vitest";
import { reengageQuestionForGate } from "./gate-reengage";

// ============================================================================
// FIX-351 — turno vazio com gate pendente NUNCA pode virar "Acho que me perdi"
// ----------------------------------------------------------------------------
// Reproduzido ao vivo (2026-07-14, rodada 5, canal web):
//
//   AGENTE:  ...Bora ver as opções na sua faixa de 150 mil?   [card topic_picker]
//   USUÁRIO: pode sim
//   AGENTE:  Acho que me perdi por aqui. Pode mandar de novo, por favor?
//
// O `turn-trace` provou: `finishReason: "empty-turn-fallback"`, zero tools, zero
// artifacts e `suppressed: []` — o sanitizer NÃO cortou nada, o modelo é que não
// gerou texto. O route já tenta um "reengage" (re-perguntar o gate pendente) antes
// do fallback, MAS `reengageQuestionForGate` só cobria os gates de COLETA
// (`credit`, `lance`, `lance-value`, `lance-embutido`, `identify`).
//
// O gate pendente naquele momento era `reco-consent` — fora da lista. Reengage
// devolvia null → o servidor cuspia "me perdi" com o usuário tendo respondido
// "pode sim", claríssimo.
//
// Regra: se HÁ um gate pendente com pergunta, o turno vazio re-pergunta esse gate.
// Conduzir > confessar confusão.
// ============================================================================

describe("turno vazio: qualquer gate com pergunta é reengajado (nunca 'me perdi')", () => {
	const GATES_COM_PERGUNTA = [
		"desire",
		"credit",
		"identify",
		"experience",
		"reco-consent",
		"timeframe",
		"lance",
		"lance-value",
		"lance-embutido",
		"simulator-offer",
	] as const;

	for (const gate of GATES_COM_PERGUNTA) {
		it(`gate "${gate}" pendente → o turno vazio re-pergunta, não diz "me perdi"`, () => {
			const q = reengageQuestionForGate(gate, "auto", 1, 150_000);
			expect(
				q,
				`o gate "${gate}" tem pergunta própria — se o turno fechar mudo com ele pendente, ` +
					`o agente TEM que re-perguntar. Devolver null aqui faz o servidor responder ` +
					`"Acho que me perdi por aqui", com o usuário tendo respondido claramente.`,
			).toBeTruthy();
		});
	}

	it("sem gate pendente (search/decision), não há o que reengajar", () => {
		expect(reengageQuestionForGate("search", "auto", 1)).toBeNull();
	});
});
