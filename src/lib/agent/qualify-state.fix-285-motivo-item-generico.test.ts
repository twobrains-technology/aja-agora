import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, shouldAskMotive } from "./qualify-state";

// ============================================================================
// FIX-285 (r9 onda 2, veredito Sonnet 5 pós-onda-1, G-C): `shouldAskMotive`
// dependia de `q.desiredItem` como proxy de "o cliente respondeu ao gate
// desire" — mas o `turn-analyzer.ts` devolve `desiredItem: null` POR DESIGN
// quando o usuário só nomeia a categoria genérica ("um carro", "uns 80 mil"),
// sem citar um item específico ("um Corolla"). Resultado: o motivo nunca era
// perguntado e `identify` disparava direto — o funil pulava fora de ordem e o
// CPF acabava sendo pedido 2x em sequência (dossiê probe-i1-empty-turn).
//
// A precondição troca de `Boolean(q.desiredItem)` pra `Boolean(meta.
// desireAnswered)` — um campo determinístico marcado em `analyze.ts` no
// primeiro turno de usuário após o gate `desire` já ter sido perguntado,
// independente do que o analyzer conseguiu extrair como item específico.
// ============================================================================

describe("FIX-285 — shouldAskMotive não depende mais de desiredItem específico", () => {
	it("desireAnswered=true + item genérico (desiredItem undefined) → segura o funil pro motivo (hoje retorna false)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			desireAnswered: true,
			qualifyAnswers: { desiredItem: undefined, motivation: undefined },
			motivationAsked: false,
		};
		expect(shouldAskMotive(meta)).toBe(true);
	});

	it("consequência: identify NÃO dispara neste turno — mesma trava do FIX-274, agora sem depender do item", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			desireAnswered: true,
			identityCollected: false,
			qualifyAnswers: { desiredItem: undefined, motivation: undefined },
		};
		expect(
			decideShowGate({ gate: "identify", intent: "neutral", meta, isUserTurn: true }),
		).toBe(false);
	});

	it("sem desireAnswered (estado pré-fix), mesmo com desiredItem ausente, NÃO segura — prova que o campo novo é quem decide agora", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			qualifyAnswers: {},
		};
		expect(shouldAskMotive(meta)).toBe(false);
	});

	it("com desiredItem específico E desireAnswered=true, continua segurando — não regride o caminho feliz (FIX-274)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			desireAnswered: true,
			qualifyAnswers: { desiredItem: "kia sportage" },
		};
		expect(shouldAskMotive(meta)).toBe(true);
	});

	it("motivo já respondido → não segura mais, mesmo com item genérico (idempotência preservada)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			desireAnswered: true,
			qualifyAnswers: { desiredItem: undefined, motivation: "cansei do carro velho" },
		};
		expect(shouldAskMotive(meta)).toBe(false);
	});

	it("motivationAsked=true (beat já rodou) → não bloqueia mais, mesmo sem motivo (não-bloqueante, FIX-274)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			desireAnswered: true,
			motivationAsked: true,
			qualifyAnswers: { desiredItem: undefined, motivation: undefined },
		};
		expect(shouldAskMotive(meta)).toBe(false);
	});
});
