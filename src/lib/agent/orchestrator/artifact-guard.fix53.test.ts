import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { type ArtifactGuardInput, evaluateArtifactGuards } from "./artifact-guard";

// ============================================================================
// FIX-53 (jornada2_revisão.docx — Bernardo, 2026-06-19) — HISTÓRICO, ordem
// REVERTIDA pelo FIX-296 (rodada 10, 2026-07-12: "valor antes dos dados"). O
// gate `credit` (value picker) server-emitido já respeita a ordem nova
// (qualify-state: credit precede identify). Esta é a 2ª linha de defesa: se
// o MODELO chamar present_value_picker (artifact value_picker) fora de
// ordem, o guard suprime — antes do desire ter sido respondido (cedo demais)
// OU com o valor já coletado (anti-repetição). Pós-reveal o picker é
// legítimo (ajuste de valor) e passa.
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

describe("FIX-53/FIX-296 — value_picker fora de ordem (valor antes dos dados + anti-repetição)", () => {
	it("pré-reveal SEM desire respondido → suprime (cedo demais pro credit)", () => {
		const v = evaluateArtifactGuards(makeInput({ meta: { desireAsked: false } }));
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.rule).toBe("value-picker-order");
	});

	it("pré-reveal COM desire respondido mas valor JÁ coletado → suprime (não re-pede o valor)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		const v = evaluateArtifactGuards(makeInput({ meta }));
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.rule).toBe("value-picker-order");
	});

	it("pré-reveal COM desire respondido e SEM valor ainda → PERMITE (momento certo do picker)", () => {
		const v = evaluateArtifactGuards(makeInput({ meta: { desireAsked: true } }));
		expect(v.allow).toBe(true);
	});

	it("pós-reveal → PERMITE value_picker (ajuste de valor é legítimo)", () => {
		const meta: ConversationMetadata = {
			revealCompleted: true,
			searchDispatched: true,
			desireAsked: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		const v = evaluateArtifactGuards(makeInput({ meta }));
		expect(v.allow).toBe(true);
	});
});
