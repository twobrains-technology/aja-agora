// FIX-431 — o card do CONTRATO não perde a vez para o teto de cards.
//
// `golden-fecho-nao-anda-pra-tras`, turno 9. O cliente diz "isso, quero
// contratar", o roteador decide certo (`[route] gate=contract show=true`) — e o
// formulário não aparece:
//
//     [teto-de-cards-por-turno] guard: suprimindo contract_form
//                               — já saíram 2 cards neste turno
//
// Os dois cards que ocuparam o turno foram o hero (que estava pendente do
// consentimento) e o de escassez. Ou seja: o cliente pediu para contratar e
// recebeu a recomendação de novo, porque dois cards de apresentação chegaram
// primeiro na fila.
//
// O teto existe por um motivo real (saíram QUATRO cards de uma vez e o cliente
// rolava uma parede sem saber o que decidir) e continua valendo. O que muda é a
// precedência: quando o cliente pediu para fechar, o formulário é O card do
// turno — quem espera o próximo turno é a apresentação, não a venda.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { evaluateArtifactGuards } from "./artifact-guard";

function entrada(artifactType: string, turnArtifactTypes: string[]) {
	return {
		artifactType,
		turnArtifactTypes,
		meta: {
			revealCompleted: true,
			identityCollected: true,
			escolha: { administradora: "ITAÚ", groupId: "g1" },
		} as ConversationMetadata,
		conversationId: "conv-fecho",
		userIntent: "ready_to_proceed",
		isUserTurn: true,
	} as Parameters<typeof evaluateArtifactGuards>[0];
}

describe("teto de cards por turno", () => {
	it("o formulário de contratação passa mesmo com 2 cards no turno", () => {
		const v = evaluateArtifactGuards(entrada("contract_form", ["recommendation_card", "scarcity"]));
		expect(v.allow, "o cliente pediu para contratar e o formulário foi cortado pelo teto").toBe(
			true,
		);
	});

	// O teto continua inteiro para o que ele nasceu para conter: avalanche de
	// card de APRESENTAÇÃO.
	it("card de apresentação continua esperando o próximo turno", () => {
		const v = evaluateArtifactGuards(
			entrada("comparison_table", ["recommendation_card", "scarcity"]),
		);
		expect(v.allow).toBe(false);
	});

	// Com menos de 2 cards no turno, o TETO não é o motivo de bloqueio nenhum
	// (outros guards podem barrar por outras razões — reveal-loop, por exemplo —
	// e isso não é assunto deste teste).
	it("com menos de 2 cards, o teto não entra", () => {
		const v = evaluateArtifactGuards(entrada("comparison_table", ["scarcity"]));
		// O union só tem `rule`/`logLine` no ramo de bloqueio — acessar sem
		// estreitar era erro de typecheck (achado da re-auditoria de 2026-08-13).
		if (!v.allow) expect(v.rule).not.toBe("teto-de-cards-por-turno");
	});
});
