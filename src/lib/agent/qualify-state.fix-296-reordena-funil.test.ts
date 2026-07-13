import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate, shouldMirrorMotivation } from "./qualify-state";

// ============================================================================
// FIX-296 (rodada 10, loop-de-goal consórcio, 2026-07-12) — reordena o funil
// pré-reveal fiel ao mockup `docs/design/specs/assets/2026-07-12-aja-dois-
// cenarios.html` (array F1): categoria(divider, já existente)→nome→desire(bem)
// →motivo(turno próprio)→[espelho+objetivo]→credit(contextual ao bem)→identify
// (moldura "ofertas reais")→search.
//
// Reversão CONSCIENTE do FIX-53 ("dados antes do valor"): a palavra nova do
// mockup vence — rapport (motivo→espelho→valor) antes de dados. O invariante
// REAL nunca foi "identidade logo após o desire": é "identidade SEMPRE antes
// do search" — isso continua intacto, só a posição relativa ao credit muda.
// ============================================================================

describe("FIX-296 — credit vem ANTES de identify (reversão consciente do FIX-53)", () => {
	const base: ConversationMetadata = { desireAsked: true, currentCategory: "auto" };

	it("logo após o desire, sem valor nem identidade → credit (NUNCA identify)", () => {
		expect(nextGate(base, { hasContactName: true })).toBe("credit");
	});

	it("valor já coletado, SEM identidade → identify", () => {
		expect(
			nextGate({ ...base, qualifyAnswers: { creditMax: 80_000 } }, { hasContactName: true }),
		).toBe("identify");
	});

	it("identidade coletada, SEM valor → credit (não pula pro identify de novo)", () => {
		expect(nextGate({ ...base, identityCollected: true }, { hasContactName: true })).toBe(
			"credit",
		);
	});

	it("identidade E valor prontos → search", () => {
		expect(
			nextGate(
				{ ...base, identityCollected: true, qualifyAnswers: { creditMax: 80_000 } },
				{ hasContactName: true },
			),
		).toBe("search");
	});
});

describe("FIX-296 — beat de espelho+objetivo segura o funil UMA vez após o motivo", () => {
	const posMotivo = (over: Partial<ConversationMetadata> = {}): ConversationMetadata => ({
		desireAsked: true,
		desireAnswered: true,
		motivationAsked: true,
		currentCategory: "auto",
		qualifyAnswers: { desiredItem: "corolla", motivation: "carro velho, vive na oficina" },
		...over,
	});

	it("shouldMirrorMotivation: true quando motivo já veio e o beat ainda não rodou", () => {
		expect(shouldMirrorMotivation(posMotivo())).toBe(true);
	});

	it("shouldMirrorMotivation: false sem motivo capturado (nada pra espelhar)", () => {
		expect(
			shouldMirrorMotivation(posMotivo({ qualifyAnswers: { desiredItem: "corolla" } })),
		).toBe(false);
	});

	it("shouldMirrorMotivation: false depois que o beat já rodou (motivationMirrored)", () => {
		expect(shouldMirrorMotivation(posMotivo({ motivationMirrored: true }))).toBe(false);
	});

	it("decideShowGate segura o gate credit (nenhum card) enquanto o beat não rodou — mesmo em intent de queixa", () => {
		const meta = posMotivo();
		expect(nextGate(meta, { hasContactName: true })).toBe("credit");
		for (const intent of ["expressing_doubt", "off_topic", "neutral", "providing_info"] as const) {
			expect(
				decideShowGate({ gate: "credit", intent, meta, isUserTurn: true }),
				`intent=${intent}`,
			).toBe(false);
		}
	});

	it("uma vez motivationMirrored=true, credit dispara normalmente no turno seguinte (intent tolerante, gate de coleta)", () => {
		const meta = posMotivo({ motivationMirrored: true });
		expect(
			decideShowGate({ gate: "credit", intent: "neutral", meta, isUserTurn: true }),
		).toBe(true);
		expect(
			decideShowGate({ gate: "credit", intent: "expressing_doubt", meta, isUserTurn: true }),
		).toBe(false);
	});

	it("sem motivationAsked ainda (shouldAskMotive segurando), shouldMirrorMotivation é false — beats não colidem", () => {
		const meta = posMotivo({ motivationAsked: false });
		expect(shouldMirrorMotivation(meta)).toBe(false);
	});
});

describe("FIX-296 — copy contextual do credit usa o bem específico (desiredItem)", () => {
	// A função gateQuestion é testada em separado (gate-questions); aqui só a
	// máquina de estados — cobertura de copy fica no arquivo de gate-questions.
	it("nextGate continua determinístico independente de copy (smoke)", () => {
		expect(
			nextGate(
				{ desireAsked: true, qualifyAnswers: { desiredItem: "corolla" } },
				{ hasContactName: true },
			),
		).toBe("credit");
	});
});
