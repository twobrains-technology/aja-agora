import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { type ArtifactGuardInput, evaluateArtifactGuards } from "./artifact-guard";

// ============================================================================
// FIX-53 (jornada2_revisão.docx — Bernardo, 2026-06-19): "Precisa pedir os
// dados, antes do valor" + "Voltou a pedir o valor". O gate `credit` (value
// picker) server-emitido já respeita a ordem nova (qualify-state). Esta é a
// 2ª linha de defesa: se o MODELO chamar present_value_picker (artifact
// value_picker) fora de ordem, o guard suprime — antes da identidade (dados
// antes do valor) OU com o valor já coletado (anti-repetição). Pós-reveal o
// picker é legítimo (ajuste de valor) e passa.
// ============================================================================

function makeInput(over: Partial<ArtifactGuardInput> = {}): ArtifactGuardInput {
	return {
		meta: {},
		artifactType: "value_picker",
		userIntent: "providing_info",
		isUserTurn: true,
		discoveryCount: null,
		conversationId: "conv-fix53",
		turnArtifactTypes: [],
		...over,
	};
}

describe("FIX-53 — value_picker fora de ordem (dados antes do valor + anti-repetição)", () => {
	it("pré-reveal SEM identidade → suprime (identidade vem ANTES do valor)", () => {
		const v = evaluateArtifactGuards(makeInput({ meta: { identityCollected: false } }));
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.rule).toBe("value-picker-order");
	});

	it("pré-reveal COM identidade mas valor JÁ coletado → suprime (não re-pede o valor)", () => {
		const meta: ConversationMetadata = {
			identityCollected: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		const v = evaluateArtifactGuards(makeInput({ meta }));
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.rule).toBe("value-picker-order");
	});

	it("pré-reveal COM identidade e SEM valor ainda → PERMITE (momento certo do picker)", () => {
		const v = evaluateArtifactGuards(makeInput({ meta: { identityCollected: true } }));
		expect(v.allow).toBe(true);
	});

	it("pós-reveal → PERMITE value_picker (ajuste de valor é legítimo)", () => {
		const meta: ConversationMetadata = {
			revealCompleted: true,
			searchDispatched: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		const v = evaluateArtifactGuards(makeInput({ meta }));
		expect(v.allow).toBe(true);
	});
});
