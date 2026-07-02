// Camada 1 — FIX-20: pilha de guards do runner extraída pra tabela declarativa.
// Plano: docs/correcoes/done/fix-20-artifact-guard-declarativo.md
//
// Refactor PURO: cada regra abaixo espelha 1:1 um guard que vivia inline no
// case tool-call do runner (runner.ts). Os cassettes de comportamento em
// tests/regression/agent-trajectory.test.ts + o integration
// runner.contract-guard.integration.test.ts são a rede de segurança.
//
// 1 teste por regra (cenário que SUPRIME + cenário que PERMITE) + teste de
// ORDEM (a ordem dos else-ifs do runner era semântica implícita; aqui é
// array explícito e testável).

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import {
	ARTIFACT_GUARD_RULES,
	type ArtifactGuardInput,
	evaluateArtifactGuards,
} from "./artifact-guard";

function makeInput(over: Partial<ArtifactGuardInput> = {}): ArtifactGuardInput {
	return {
		meta: {},
		artifactType: "recommendation_card",
		userIntent: "neutral",
		isUserTurn: true,
		discoveryCount: null,
		conversationId: "conv-test",
		turnArtifactTypes: [],
		...over,
	};
}

const POST_REVEAL: ConversationMetadata = {
	revealCompleted: true,
	searchDispatched: true,
	identityCollected: true,
};

describe("FIX-20 — ordem EXPLÍCITA das regras (era semântica implícita dos else-ifs)", () => {
	it("a ordem é exatamente a do if-chain original do runner", () => {
		expect(ARTIFACT_GUARD_RULES.map((r) => r.name)).toEqual([
			// FIX-187: turno com erro de descoberta → nenhuma proposta, é a regra
			// mais forte (1ª da lista, vence qualquer outra).
			"discovery-failed",
			"whatsapp-optin",
			"post-closure",
			"premature-contract",
			"reveal-loop",
			"single-option",
			// FIX-53: value_picker fora de ordem (dados antes do valor + anti-repetição).
			"value-picker-order",
		]);
	});

	it("precedência: recommendation_card pós-fechamento em turno de usuário — post-closure vence reveal-loop (log do estado terminal)", () => {
		// Ambas as regras aplicam; o runner original logava [post-closure]
		// (vinha antes no chain). A tabela preserva o vencedor.
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { ...POST_REVEAL, contractClosed: true },
				artifactType: "recommendation_card",
				isUserTurn: true,
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("post-closure");
	});

	it("precedência: contract_form pós-fechamento — reveal-loop (isContractDup) responde, post-closure não cobre contract_form", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { ...POST_REVEAL, contractClosed: true },
				artifactType: "contract_form",
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("reveal-loop");
	});
});

describe("FIX-20 — regra whatsapp-optin (PF-07 + BUG-OPTIN-ENGOLE-GATES)", () => {
	it("SUPRIME: optin pré-reveal (engolia gates da qualificação)", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({ meta: { qualifyAnswers: { hasLance: "yes" } }, artifactType: "whatsapp_optin" }),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) {
			expect(verdict.rule).toBe("whatsapp-optin");
			expect(verdict.logLine).toBe(
				"[whatsapp-optin] guard: suprimindo artifact (pré-reveal ou duplicado) (conv=conv-test)",
			);
		}
	});

	it("SUPRIME: optin duplicado (whatsappOptinShown=true)", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { ...POST_REVEAL, whatsappOptinShown: true },
				artifactType: "whatsapp_optin",
			}),
		);
		expect(verdict.allow).toBe(false);
	});

	it("PERMITE: primeiro optin pós-reveal", () => {
		expect(
			evaluateArtifactGuards(makeInput({ meta: POST_REVEAL, artifactType: "whatsapp_optin" })),
		).toEqual({ allow: true });
	});
});

describe("FIX-20 — regra post-closure (FIX-11: estado terminal)", () => {
	const CLOSED: ConversationMetadata = { ...POST_REVEAL, contractClosed: true };

	it("SUPRIME toda a família de descoberta/simulação/decisão, em QUALQUER intent", () => {
		for (const artifactType of [
			"recommendation_card",
			"simulation_result",
			"comparison_table",
			"group_card",
			"contemplation_dial",
			"decision_prompt",
		] as const) {
			for (const userIntent of ["neutral", "providing_info", "asking_question"] as const) {
				const verdict = evaluateArtifactGuards(
					makeInput({ meta: CLOSED, artifactType, userIntent }),
				);
				expect(verdict.allow, `${artifactType}/${userIntent} deveria ser suprimido`).toBe(false);
			}
		}
	});

	it("logLine preserva o formato que os cassettes/grep de produção conhecem", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({ meta: CLOSED, artifactType: "simulation_result", userIntent: "providing_info" }),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) {
			expect(verdict.logLine).toBe(
				"[post-closure] guard: suprimindo simulation_result pós-fechamento — estado terminal (conv=conv-test, intent=providing_info)",
			);
		}
	});

	it("PERMITE: mesmos artifacts com contrato NÃO fechado", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: POST_REVEAL,
				artifactType: "simulation_result",
				userIntent: "providing_info",
			}),
		);
		expect(verdict).toEqual({ allow: true });
	});
});

describe("FIX-20 — regra premature-contract (FIX-12: contract_form pré-reveal)", () => {
	it("SUPRIME: contract_form sem reveal (criaria proposta REAL na Bevi sem o usuário ver opção)", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({ meta: {}, artifactType: "contract_form", userIntent: "ready_to_proceed" }),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) {
			expect(verdict.rule).toBe("premature-contract");
			expect(verdict.logLine).toBe(
				"[contract-gate] guard: suprimindo contract_form PRÉ-reveal — identidade é assunto do gate identify (conv=conv-test, intent=ready_to_proceed)",
			);
		}
	});

	it("PERMITE: contract_form pós-reveal (passo 5 legítimo)", () => {
		expect(
			evaluateArtifactGuards(makeInput({ meta: POST_REVEAL, artifactType: "contract_form" })),
		).toEqual({ allow: true });
	});
});

describe("FIX-20 — regra reveal-loop (re-emissão pós-reveal + dups)", () => {
	it("SUPRIME: cards de descoberta re-emitidos em turno de usuário pós-reveal", () => {
		for (const artifactType of ["comparison_table", "recommendation_card", "group_card"] as const) {
			const verdict = evaluateArtifactGuards(
				makeInput({ meta: POST_REVEAL, artifactType, isUserTurn: true }),
			);
			expect(verdict.allow, `${artifactType} re-emitido deveria ser suprimido`).toBe(false);
			if (!verdict.allow) {
				expect(verdict.rule).toBe("reveal-loop");
				expect(verdict.logLine).toBe(
					`[reveal-loop] guard: suprimindo ${artifactType} re-emitido pós-reveal (conv=conv-test, intent=neutral)`,
				);
			}
		}
	});

	it("SUPRIME: simulation_result pós-reveal FORA de what-if", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({ meta: POST_REVEAL, artifactType: "simulation_result", userIntent: "neutral" }),
		);
		expect(verdict.allow).toBe(false);
	});

	it("PERMITE: simulation_result em what-if (providing_info = usuário pediu novo valor)", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({
					meta: POST_REVEAL,
					artifactType: "simulation_result",
					userIntent: "providing_info",
				}),
			),
		).toEqual({ allow: true });
	});

	it("PERMITE: reveal original (revealCompleted ainda false) passa", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({ meta: { searchDispatched: true }, artifactType: "comparison_table" }),
			),
		).toEqual({ allow: true });
	});

	it("PERMITE: turno server-authored (directive) não é re-emissão", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({ meta: POST_REVEAL, artifactType: "comparison_table", isUserTurn: false }),
			),
		).toEqual({ allow: true });
	});

	it("SUPRIME: decision_prompt duplicado (decisionDispatched) em turno de usuário", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { ...POST_REVEAL, decisionDispatched: true },
				artifactType: "decision_prompt",
				isUserTurn: true,
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("reveal-loop");
	});

	it("PERMITE: primeiro decision_prompt (decisionDispatched=false)", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({ meta: POST_REVEAL, artifactType: "decision_prompt", isUserTurn: false }),
			),
		).toEqual({ allow: true });
	});
});

describe("FIX-20 — regra single-option (FIX-7: descoberta de opção única)", () => {
	it("SUPRIME: recommendation_card quando a descoberta DESTE turno retornou 1 opção", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { searchDispatched: true },
				artifactType: "recommendation_card",
				discoveryCount: 1,
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) {
			expect(verdict.rule).toBe("single-option");
			expect(verdict.logLine).toBe(
				"[single-option] guard: suprimindo recommendation_card — descoberta retornou opção única (conv=conv-test)",
			);
		}
	});

	it("PERMITE: recommendation_card com 2+ opções", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({
					meta: { searchDispatched: true },
					artifactType: "recommendation_card",
					discoveryCount: 3,
				}),
			),
		).toEqual({ allow: true });
	});

	it("PERMITE: sem descoberta neste turno (discoveryCount=null) nada é suprimido", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({
					meta: { searchDispatched: true },
					artifactType: "recommendation_card",
					discoveryCount: null,
				}),
			),
		).toEqual({ allow: true });
	});
});

describe("FIX-20 — wiring: runner consome a tabela (zero if-chain inline)", () => {
	it("runner importa e chama evaluateArtifactGuards; os booleans inline saíram", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/lib/agent/orchestrator/runner.ts", "utf-8");
		expect(src).toMatch(/evaluateArtifactGuards/);
		// os 7 guards inline não vivem mais no runner
		for (const inlineGuard of [
			"isRereveal",
			"isDecisionDup",
			"isContractDup",
			"isPostClosure",
			"isSingleOptionDup",
			"isPrematureContract",
		]) {
			expect(
				src,
				`${inlineGuard} ainda inline no runner — o FIX-20 extraiu pra tabela`,
			).not.toMatch(new RegExp(`const ${inlineGuard}`));
		}
	});
});

// FIX-187 (Kairo 2026-07-01) — 2ª linha: quando a descoberta do turno falhou
// (sinal discoveryFailedThisTurn do FIX-186), NENHUM artifact da família de
// descoberta/proposta pode ser emitido — mesmo que o modelo tente. Complementa a
// 1ª linha (action-policy no execute); o artifact é emitido do INPUT no tool-call
// (antes do tool-result), então o guard reativo é a rede que realmente barra o card.
describe("FIX-187 — discovery-failed dropa a família de proposta quando a descoberta falhou", () => {
	const PROPOSAL_FAMILY = [
		"recommendation_card",
		"simulation_result",
		"comparison_table",
		"group_card",
		"decision_prompt",
		"contemplation_dial",
	] as const;

	for (const artifactType of PROPOSAL_FAMILY) {
		it(`suprime ${artifactType} quando discoveryFailedThisTurn=true`, () => {
			const v = evaluateArtifactGuards(
				makeInput({ artifactType: artifactType as never, discoveryFailedThisTurn: true }),
			);
			expect(v.allow).toBe(false);
			if (!v.allow) {
				expect(v.rule).toBe("discovery-failed");
				expect(v.logLine).toMatch(/discovery-failed/);
			}
		});
	}

	it("NÃO suprime a família quando discoveryFailedThisTurn=false (fluxo normal não regride)", () => {
		const v = evaluateArtifactGuards(
			makeInput({
				meta: POST_REVEAL,
				artifactType: "simulation_result",
				userIntent: "providing_info",
				discoveryFailedThisTurn: false,
			}),
		);
		expect(v.allow).toBe(true);
	});

	it("precedência: discovery-failed vence as demais (é a 1ª regra)", () => {
		// recommendation_card pós-fechamento E descoberta falhada → discovery-failed
		// assina o log (vem antes de post-closure no array).
		const v = evaluateArtifactGuards(
			makeInput({
				meta: { ...POST_REVEAL, contractClosed: true },
				artifactType: "recommendation_card",
				discoveryFailedThisTurn: true,
			}),
		);
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.rule).toBe("discovery-failed");
	});
});
