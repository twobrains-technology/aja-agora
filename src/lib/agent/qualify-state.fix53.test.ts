import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

// ============================================================================
// FIX-53 (jornada2_revisão.docx — teste manual Bernardo, 2026-06-19) —
// HISTÓRICO. Stakeholder pediu na revisão 2: "Precisa pedir os dados, antes do
// valor". O gate `identify` (CPF+celular+LGPD) subiu pra ANTES do `credit`.
//
// FIX-296 (rodada 10, loop-de-goal consórcio, 2026-07-12) REVERTE esta posição
// conscientemente: o mockup novo (docs/design/specs/assets/2026-07-12-aja-
// dois-cenarios.html) pede rapport ANTES de dados — "valor antes dos dados".
// "Palavra nova vence" — a razão do FIX-53 nunca foi "identidade tem que vir
// logo após o desire", foi "a Bevi exige identidade antes de simular" (D1) —
// esse invariante REAL (identidade sempre antes do `search`) continua provado
// abaixo, só a posição relativa ao `credit` mudou.
// ============================================================================

describe("FIX-296 — gate credit ANTES do identify (reversão consciente do FIX-53)", () => {
	const base: ConversationMetadata = {
		desireAsked: true,
		currentCategory: "auto",
	};

	it("logo após o desire, sem valor → credit (NUNCA identify primeiro)", () => {
		expect(nextGate(base, { hasContactName: true })).toBe("credit");
	});

	it("credit precede a coleta de identidade — qualificação parcial sem valor → credit", () => {
		expect(nextGate({ ...base }, { hasContactName: true })).toBe("credit");
	});

	it("com valor coletado, AÍ SIM o próximo é a identidade (identify)", () => {
		expect(
			nextGate({ ...base, qualifyAnswers: { creditMax: 80_000 } }, { hasContactName: true }),
		).toBe("identify");
	});

	it("identidade já coletada NÃO re-dispara identify (segue search) — anti-repetição", () => {
		expect(
			nextGate(
				{ ...base, identityCollected: true, qualifyAnswers: { creditMax: 80_000 } },
				{ hasContactName: true },
			),
		).toBe("search");
	});

	it("FIX-274: sem desireAsked, o funil ainda está no desire — só depois vem o credit", () => {
		const semDesire: ConversationMetadata = {
			currentCategory: "auto",
		};
		expect(nextGate(semDesire, { hasContactName: true })).toBe("desire");
	});

	it("INVARIANTE que NUNCA mudou: identidade SEMPRE antes do search, mesmo com qualificação completa", () => {
		expect(
			nextGate(
				{
					...base,
					qualifyAnswers: {
						creditMax: 80_000,
						prazoMeses: 12,
						hasLance: "no",
						lanceEmbutido: false,
					},
				},
				{ hasContactName: true },
			),
		).toBe("identify");
		expect(
			nextGate(
				{
					...base,
					identityCollected: true,
					qualifyAnswers: {
						creditMax: 80_000,
						prazoMeses: 12,
						hasLance: "no",
						lanceEmbutido: false,
					},
				},
				{ hasContactName: true },
			),
		).toBe("search");
	});
});
