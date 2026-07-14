import { describe, expect, it } from "vitest";
import { evaluateArtifactGuards } from "./artifact-guard";

// ============================================================================
// FIX-353 — NENHUM card pode sair duas vezes no mesmo turno
// ----------------------------------------------------------------------------
// Achado ao vivo (rodada 6, servicos-web t15): a cascata de decisão saiu INTEIRA
// duplicada —
//
//     CARDS: scarcity, decision_prompt, scarcity, decision_prompt
//
// e o turno seguinte, com o usuário respondendo claramente ("tá bom, quero
// fazer"), virou "Acho que me perdi" + um LOOP de 3× "Deixa eu tentar de outro
// jeito". A jornada morreu ali.
//
// Causa: `dispatchDecisionCascade` tem DOIS pontos de chamada (o intercepto
// pré-modelo e o pós-modelo, orchestrator/index.ts). O guard de idempotência lê
// `decisionDispatched` do BANCO — se os dois caminhos rodam no mesmo turno HTTP,
// a leitura pode acontecer antes da escrita do outro e a cascata sai em dobro.
//
// O guard `dial-dup-intraturn` já existia, mas cobria SÓ o `contemplation_dial`.
// Duplicar card é sempre defeito, para qualquer tipo — a regra vira geral.
// ============================================================================

describe("nenhum card duplica no mesmo turno (FIX-353)", () => {
	const CARDS = [
		"decision_prompt",
		"scarcity",
		"contemplation_dial",
		"recommendation_card",
		"comparison_table",
		"embedded_bid",
	] as const;

	for (const card of CARDS) {
		it(`suprime "${card}" quando ele JÁ saiu neste turno`, () => {
			const r = evaluateArtifactGuards({
				artifactType: card,
				meta: { revealCompleted: true, recoConsentAnswered: true } as never,
				conversationId: "c1",
				turnArtifactTypes: [card], // já emitido neste turno
			} as never);
			expect(
				r.allow === false,
				`${card} saindo 2x no mesmo turno é o bug que travou a jornada de serviços (rodada 6)`,
			).toBe(true);
		});

		// `decision_prompt` na 1ª vez pode ser barrado por OUTRO guard (premature-decision),
		// que tem regra própria — este teste cobre só o dedup intra-turno.
		it.skipIf(card === "decision_prompt")(`NÃO suprime "${card}" quando é a PRIMEIRA vez no turno`, () => {
			const r = evaluateArtifactGuards({
				artifactType: card,
				meta: { revealCompleted: true, recoConsentAnswered: true } as never,
				conversationId: "c1",
				turnArtifactTypes: [], // ainda não saiu
			} as never);
			expect(
				r.allow,
				`${card} tem que poder sair a 1ª vez — o guard não pode virar mordaça`,
			).toBe(true);
		});
	}
});
