import { describe, expect, it } from "vitest";
import { isInternalToolLeak, isPrematureRevealScenario } from "./sanitizer";

// ============================================================================
// Guards de reveal (2026-07-15, achados ao vivo no Chrome — Kairo)
// ----------------------------------------------------------------------------
// Dois invariantes que o directive/prompt NÃO segura (o Haiku desobedece de
// forma não-determinística), então viram CÓDIGO (Lei 4):
//
//  1. Nome de tool interno (search_groups, recommend_groups, present_*…) NUNCA
//     pode vazar pro usuário — o modelo às vezes papagaia "Agora vou chamar
//     recommend_groups e em seguida apresentar a recomendação".
//  2. NO TURNO DO REVEAL (hasSearchToolCall), o cenário de contemplação (lance,
//     meses pra contemplar, sorteio, "cenário") é PREMATURO — só aparece depois
//     que o usuário responde a familiaridade e pede a recomendação. O modelo
//     vazou "com um lance de R$ 52.600, você consegue ser contemplado no 6º mês"
//     ANTES da familiaridade.
// ============================================================================

describe("isInternalToolLeak — nome de tool interno nunca vira bolha", () => {
	it("dropa o vazamento literal de nome de tool", () => {
		expect(
			isInternalToolLeak(
				"Agora vou chamar recommend_groups e em seguida apresentar a recomendação com a simulação",
			),
		).toBe(true);
		expect(isInternalToolLeak("deixa eu rodar o search_groups")).toBe(true);
		expect(isInternalToolLeak("chamando present_recommendation_card")).toBe(true);
		expect(isInternalToolLeak("simulate_quota deu erro")).toBe(true);
	});

	it("NÃO dropa copy legítima em português (sem nome de tool)", () => {
		expect(isInternalToolLeak("Encontrei ótimas opções na sua faixa!")).toBe(false);
		expect(isInternalToolLeak("Repara na carta e na parcela de cada uma")).toBe(false);
		expect(isInternalToolLeak("Vou te recomendar a melhor opção pro seu caso")).toBe(false);
	});
});

describe("isPrematureRevealScenario — cenário técnico não vaza no turno do reveal", () => {
	const revealCtx = {
		hasReceivedDocuments: false,
		hasSearchToolCall: true,
		hasProposal: false,
	};

	it("dropa lance/contemplação/sorteio/cenário DURANTE o reveal", () => {
		expect(
			isPrematureRevealScenario(
				"com um lance de R$ 52.600, você consegue ser contemplado lá no 6º mês",
				revealCtx,
			),
		).toBe(true);
		expect(
			isPrematureRevealScenario(
				"Se você quiser dar um lance forte na hora, consegue ser contemplada em torno de 6 meses",
				revealCtx,
			),
		).toBe(true);
		expect(isPrematureRevealScenario("Do contrário, segue normalmente pelo sorteio", revealCtx)).toBe(
			true,
		);
		expect(isPrematureRevealScenario("Agora veja o cenário completo dessa opção", revealCtx)).toBe(
			true,
		);
	});

	it("NÃO dropa o anúncio das opções nem a pergunta de familiaridade", () => {
		expect(isPrematureRevealScenario("Encontrei ótimas opções na sua faixa, Cris!", revealCtx)).toBe(
			false,
		);
		expect(
			isPrematureRevealScenario("Repara na carta e na parcela de cada uma", revealCtx),
		).toBe(false);
		expect(
			isPrematureRevealScenario("E me conta: você já fez consórcio antes?", revealCtx),
		).toBe(false);
	});

	it("FORA do turno de reveal (sem search tool), NÃO toca — lance é legítimo depois", () => {
		const noSearchCtx = { ...revealCtx, hasSearchToolCall: false };
		// Explicação do novato pós-familiaridade fala de sorteio/lance legitimamente.
		expect(
			isPrematureRevealScenario(
				"a contemplação acontece por sorteio ou por lance, todo mês",
				noSearchCtx,
			),
		).toBe(false);
		// Sem contexto nenhum, também não dropa (compat).
		expect(isPrematureRevealScenario("com um lance de R$ 20 mil você antecipa")).toBe(false);
	});
});
