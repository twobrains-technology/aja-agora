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
		channel: "web",
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
			// FIX-239: decision_prompt fora de ordem (qualificação pós-reveal
			// incompleta) — mesma família do premature-contract, checada antes do
			// reveal-loop (que só cobre a RE-emissão, pós decisionDispatched).
			"premature-decision",
			"reveal-loop",
			"single-option",
			// FIX-297: hero (recommendation_card/simulation_result) pendente até o
			// gate reco-consent resolver — checado logo após single-option (que já
			// resolve o caso de 1 grupo só, sem ceremônia de consentimento).
			"hero-awaits-reco-consent",
			// FIX-53: value_picker fora de ordem (dados antes do valor + anti-repetição).
			"value-picker-order",
			// FIX-260 (rodada 5, veredito Fable r4, R5): contemplation_dial duplicado
			// no mesmo turno (2 tool-calls) — dedup intra-turno via turnArtifactTypes.
			"card-dup-intraturn",
			// FIX-300: topic_picker no instante exato do gate decision (2ª linha,
			// cobre a janela em que a fase ainda é "reveal" pro tool-policy).
			"topic-picker-server-gate",
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
				"[whatsapp-optin] guard: suprimindo artifact (canal=web, pré-reveal ou duplicado) (conv=conv-test)",
			);
		}
	});

	// FIX-338 (bloco-c-whatsapp-invariantes): mesmo com TODAS as outras condições
	// satisfeitas (reveal + contractFormDispatched, o card estaria liberado no
	// web), o canal whatsapp NUNCA emite — o opt-in pede "seu WhatsApp" dentro do
	// próprio WhatsApp, absurdo de contexto confirmado em 3 das 4 jornadas.
	it("SUPRIME: canal whatsapp, mesmo com reveal+contractFormDispatched (condições que liberariam no web)", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { ...POST_REVEAL, contractFormDispatched: true },
				artifactType: "whatsapp_optin",
				channel: "whatsapp",
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("whatsapp-optin");
	});

	it("SUPRIME: optin duplicado (whatsappOptinShown=true)", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { ...POST_REVEAL, contractFormDispatched: true, whatsappOptinShown: true },
				artifactType: "whatsapp_optin",
			}),
		);
		expect(verdict.allow).toBe(false);
	});

	// FIX-303 (rodada r10 onda 2): pós-reveal sozinho não basta mais — o optin só
	// é permitido no FECHO (contractFormDispatched=true, present_contract_form
	// já apresentado). Regressão do bug real: card soltava logo após a
	// recomendação, sem proposta nenhuma na tela.
	it("SUPRIME: optin pós-reveal SEM contractFormDispatched (FIX-303 — ainda não é fecho)", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({ meta: POST_REVEAL, artifactType: "whatsapp_optin" }),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("whatsapp-optin");
	});

	it("PERMITE: primeiro optin no fecho (reveal + contractFormDispatched)", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({
					meta: { ...POST_REVEAL, contractFormDispatched: true },
					artifactType: "whatsapp_optin",
				}),
			),
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

// FIX-239 (Fable r1, D3.4, gap P1 #6a): "Gostei, faz bastante sentido" (elogio
// pós-reveal, NÃO decisão) disparava decision_prompt ANTES de
// experience/timeframe/lance estarem resolvidos — o LLM podia chamar
// present_decision_prompt livremente (tool liberada pela fase "reveal"), sem
// nenhum guard checando se a qualificação pós-reveal estava completa.
// nextGate() é a fonte única da ordem — só retorna "decision" quando
// experience/timeframe/lance(+lance-embutido/simulator-offer) já resolveram.
describe("FIX-239 — regra premature-decision (decision_prompt antes da qualificação pós-reveal)", () => {
	const POST_REVEAL_PRE_QUALIFY: ConversationMetadata = {
		desireAsked: true,
		qualifyConsented: true,
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		qualifyAnswers: { creditMax: 100_000 },
		// experiencePrev/prazoMeses/hasLance ainda NÃO resolvidos — nextGate()
		// aqui é "experience", nunca "decision".
	};

	const POST_REVEAL_QUALIFIED: ConversationMetadata = {
		...POST_REVEAL_PRE_QUALIFY,
		experiencePrev: "returning",
		// FIX-297/FIX-308: reco-consent precisa estar RESPONDIDO pra nextGate
		// cruzar experience/timeframe/lance até chegar em "decision".
		recoConsentDispatched: true,
		recoConsentAnswered: true,
		qualifyAnswers: {
			creditMax: 100_000,
			prazoMeses: 12,
			hasLance: "no",
			lanceEmbutido: false,
		},
		simulatorOfferDispatched: true,
	};

	it("SUPRIME: decision_prompt disparado num elogio ANTES de experience/timeframe/lance resolvidos", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: POST_REVEAL_PRE_QUALIFY,
				artifactType: "decision_prompt",
				userIntent: "neutral",
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) {
			expect(verdict.rule).toBe("premature-decision");
			expect(verdict.logLine).toMatch(/premature-decision/);
		}
	});

	it("SUPRIME também em ready_to_proceed (elogio forte) antes da qualificação", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: POST_REVEAL_PRE_QUALIFY,
				artifactType: "decision_prompt",
				userIntent: "ready_to_proceed",
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("premature-decision");
	});

	it("PERMITE: decision_prompt pós-qualificação completa (nextGate já é decision)", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({ meta: POST_REVEAL_QUALIFIED, artifactType: "decision_prompt" }),
			),
		).toEqual({ allow: true });
	});

	it("não interfere em outros artifacts (ex.: embedded_bid) pré-qualificação", () => {
		// embedded_bid não faz parte da família reveal-loop (isRereveal) — isola
		// que a regra premature-decision é ESPECÍFICA de decision_prompt.
		expect(
			evaluateArtifactGuards(
				makeInput({ meta: POST_REVEAL_PRE_QUALIFY, artifactType: "embedded_bid" }),
			),
		).toEqual({ allow: true });
	});

	it("decisionDispatched=true → premature-decision não se aplica (é papel do isDecisionDup/reveal-loop)", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { ...POST_REVEAL_PRE_QUALIFY, decisionDispatched: true },
				artifactType: "decision_prompt",
				isUserTurn: true,
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("reveal-loop");
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

	it("PERMITE: primeiro decision_prompt (decisionDispatched=false) COM qualificação pós-reveal completa", () => {
		// FIX-239: POST_REVEAL sozinho (sem experience/timeframe/lance) NÃO
		// basta mais — vira "premature-decision" (ver describe dedicado acima).
		// Este teste isola o caminho FELIZ: qualificação completa + 1ª emissão.
		const qualified: ConversationMetadata = {
			...POST_REVEAL,
			desireAsked: true,
			qualifyConsented: true,
			experiencePrev: "returning",
			// FIX-297/FIX-308: reco-consent precisa estar RESPONDIDO pra nextGate
			// cruzar experience/timeframe/lance até chegar em "decision".
			recoConsentDispatched: true,
			recoConsentAnswered: true,
			qualifyAnswers: {
				creditMax: 100_000,
				prazoMeses: 12,
				hasLance: "no",
				lanceEmbutido: false,
			},
			simulatorOfferDispatched: true,
		};
		expect(
			evaluateArtifactGuards(
				makeInput({ meta: qualified, artifactType: "decision_prompt", isUserTurn: false }),
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

	it("PERMITE: recommendation_card com 2+ opções (pós reco-consent já resolvido — FIX-297 isolado no describe dedicado)", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({
					meta: { searchDispatched: true, revealCompleted: true, recoConsentAnswered: true },
					artifactType: "recommendation_card",
					discoveryCount: 3,
					isUserTurn: false,
				}),
			),
		).toEqual({ allow: true });
	});

	it("PERMITE: sem descoberta neste turno (discoveryCount=null), pós reco-consent já resolvido", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({
					meta: { searchDispatched: true, revealCompleted: true, recoConsentAnswered: true },
					artifactType: "recommendation_card",
					discoveryCount: null,
					isUserTurn: false,
				}),
			),
		).toEqual({ allow: true });
	});
});

describe("FIX-297 — regra hero-awaits-reco-consent (reveal em dois tempos com consentimento)", () => {
	it("SUPRIME recommendation_card no reveal ORIGINAL (revealCompleted ainda false), independente de discoveryCount", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { searchDispatched: true },
				artifactType: "recommendation_card",
				discoveryCount: 3,
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("hero-awaits-reco-consent");
	});

	it("SUPRIME simulation_result quando 2+ grupos (aprofunda o hero, que ainda não foi consentido)", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { searchDispatched: true },
				artifactType: "simulation_result",
				discoveryCount: 2,
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("hero-awaits-reco-consent");
	});

	it("PERMITE simulation_result com 1 grupo só (é o card único do reveal, sem ceremônia de consentimento)", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({
					meta: { searchDispatched: true },
					artifactType: "simulation_result",
					discoveryCount: 1,
				}),
			),
		).toEqual({ allow: true });
	});

	it("SUPRIME recommendation_card mesmo com revealCompleted=true, SE reco-consent ainda não foi respondido (FIX-316, veredito Fable — achado real: o LLM chamava a tool de novo num turno pós-reveal, sem consentimento, e o guard antigo deixava passar por checar só revealCompleted)", () => {
		const verdict = evaluateArtifactGuards(
			makeInput({
				meta: { searchDispatched: true, revealCompleted: true },
				artifactType: "recommendation_card",
				discoveryCount: 3,
				isUserTurn: false,
			}),
		);
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("hero-awaits-reco-consent");
	});

	it("PERMITE recommendation_card num turno pós-reveal QUANDO reco-consent já foi respondido", () => {
		expect(
			evaluateArtifactGuards(
				makeInput({
					meta: { searchDispatched: true, revealCompleted: true, recoConsentAnswered: true },
					artifactType: "recommendation_card",
					discoveryCount: 3,
					isUserTurn: false,
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

// FIX-260 (rodada 5, veredito Fable r4, R5): "contemplation_dial DUPLICADO no
// mesmo turno (2 tool-calls, initialTargetMonth 12 e 6)" — a instrução do
// directive ("chame UMA vez") é regra-no-prompt, não invariante (Lei 4). O
// runner JÁ ampara turnArtifactTypes (runner.ts:408, artifacts.map já emitidos
// neste turno) — a tabela só precisava de uma regra que a consumisse.
describe("FIX-260 — regra dial-dup-intraturn (contemplation_dial 2ª chamada no mesmo turno)", () => {
	it("suprime a 2ª chamada de contemplation_dial quando já emitido neste turno", () => {
		const v = evaluateArtifactGuards(
			makeInput({
				meta: POST_REVEAL,
				artifactType: "contemplation_dial",
				turnArtifactTypes: ["contemplation_dial"],
			}),
		);
		expect(v.allow).toBe(false);
		if (!v.allow) {
			expect(v.rule).toBe("card-dup-intraturn");
			expect(v.logLine).toMatch(/card-dup-intraturn/);
		}
	});

	it("PERMITE a 1ª chamada de contemplation_dial no turno (turnArtifactTypes vazio)", () => {
		const v = evaluateArtifactGuards(
			makeInput({
				meta: POST_REVEAL,
				artifactType: "contemplation_dial",
				turnArtifactTypes: [],
			}),
		);
		expect(v.allow).toBe(true);
	});

	it("FIX-353: a regra passou a valer pra QUALQUER card repetido no mesmo turno (não só o dial)", () => {
		// Antes era escopada ao contemplation_dial. Ao vivo (rodada 6, servicos-web
		// t15) a cascata de decisão saiu em dobro — "scarcity, decision_prompt,
		// scarcity, decision_prompt" — e a jornada travou num loop. Duplicar card é
		// defeito para qualquer tipo.
		const v = evaluateArtifactGuards(
			makeInput({
				meta: POST_REVEAL,
				artifactType: "scarcity",
				turnArtifactTypes: ["scarcity"],
			}),
		);
		expect(v.allow).toBe(false);
		expect(v.rule).toBe("card-dup-intraturn");
	});
});

// FIX-300 (P6, loop-de-goal r10): print real — o Qwen chamou present_topic_
// picker no gate `decision` com chips "a"/"b" fabricados em vez do card "Esse
// plano faz sentido?". tool-policy.ts já bloqueia topic_picker em closing/
// terminal, mas o instante exato do gate `decision` ainda é fase "reveal"
// (decisionDispatched só vira true DEPOIS do directive) — esta regra é a 2ª
// linha que cobre esse instante específico via nextGate().
describe("FIX-300 — regra topic-picker-server-gate (card alucinado no gate decision)", () => {
	const DECISION_GATE_META: ConversationMetadata = {
		desireAsked: true,
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		experiencePrev: "returning",
		// FIX-297/FIX-308 (rodada 10): reveal em dois tempos insere o gate
		// `reco-consent` entre `experience` e `decision` — sem marcá-lo
		// RESPONDIDO (não só dispatched), nextGate() para em "reco-consent", não
		// "decision", e a regra topic-picker-server-gate (que só aplica em
		// nextGate===decision) nunca dispara.
		recoConsentDispatched: true,
		recoConsentAnswered: true,
		qualifyAnswers: {
			creditMax: 120_000,
			prazoMeses: 24,
			hasLance: "no",
			lanceEmbutido: false,
		},
		simulatorOfferDispatched: true,
		decisionDispatched: false,
	};

	it("sonda adversarial: suprime topic_picker no gate decision, mesmo com chips arbitrários ('a'/'b') fabricados pelo modelo", () => {
		const v = evaluateArtifactGuards(
			makeInput({
				meta: DECISION_GATE_META,
				artifactType: "topic_picker",
				isUserTurn: false,
			}),
		);
		expect(v.allow).toBe(false);
		if (!v.allow) {
			expect(v.rule).toBe("topic-picker-server-gate");
			expect(v.logLine).toMatch(/topic-picker-server-gate/);
		}
	});

	it("PERMITE topic_picker fora do gate decision (ex.: meio da qualificação, dúvida legítima)", () => {
		const v = evaluateArtifactGuards(
			makeInput({
				meta: { desireAsked: true },
				artifactType: "topic_picker",
			}),
		);
		expect(v.allow).toBe(true);
	});

	it("NÃO afeta outros artifacts no mesmo gate decision (regra escopada a topic_picker)", () => {
		const v = evaluateArtifactGuards(
			makeInput({
				meta: DECISION_GATE_META,
				artifactType: "decision_prompt",
			}),
		);
		expect(v.allow).toBe(true);
	});
});
