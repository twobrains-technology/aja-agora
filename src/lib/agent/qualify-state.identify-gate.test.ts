import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate } from "./qualify-state";

// Gate "identify" — D1 (docs/jornada/CONTEXT.md): a Bevi exige CPF+celular+LGPD
// ANTES de simular. FIX-53 (jornada2_revisão.docx — Bernardo, 2026-06-19):
// "Precisa pedir os dados, antes do valor" — a identidade subiu de ÚLTIMO gate
// da qualificação para LOGO APÓS o consent, ANTES do `credit` (valor). A busca
// real continua exigindo identidade (tripwire), aqui já coletada cedo.

const qualifiedBase: ConversationMetadata = {
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	// FIX-4: lanceEmbutido respondido — o gate de lance embutido agora vale
	// pra TODO hasLance (docx educa todo mundo); qualificação completa o inclui.
	qualifyAnswers: { creditMax: 80_000, prazoMeses: 12, hasLance: "no", lanceEmbutido: false },
};

describe("nextGate — identify vem ANTES do valor (FIX-53)", () => {
	it("consent dado, SEM identidade → identify (antes de qualquer valor)", () => {
		const meta: ConversationMetadata = { experiencePrev: "first", qualifyConsented: true };
		expect(nextGate(meta)).toBe("identify");
	});

	it("identify precede o valor mesmo com valor já volunteered", () => {
		const meta: ConversationMetadata = {
			experiencePrev: "first",
			qualifyConsented: true,
			qualifyAnswers: { creditMax: 80_000, prazoMeses: 12 },
		};
		expect(nextGate(meta)).toBe("identify");
	});

	it("COM identidade + qualificação completa (lance=no) → search (descoberta liberada)", () => {
		expect(nextGate(qualifiedBase)).toBe("search");
	});

	it("COM identidade, lance=yes SEM lance-embutido respondido → lance-embutido (antes da busca)", () => {
		const meta: ConversationMetadata = {
			...qualifiedBase,
			// lanceValue já respondido (gate lance-value tem suite própria)
			qualifyAnswers: {
				...qualifiedBase.qualifyAnswers,
				hasLance: "yes",
				lanceValue: 30_000,
				// sobrepõe o lanceEmbutido:false da base — aqui queremos SEM resposta
				lanceEmbutido: undefined,
			},
		};
		expect(nextGate(meta)).toBe("lance-embutido");
	});

	it("COM identidade, valor já coletado → segue lance (NÃO re-pede o valor; FIX-103: prazo fora)", () => {
		const meta: ConversationMetadata = {
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		expect(nextGate(meta)).toBe("lance");
	});

	it("fluxo pós-busca não regride: search dispatched + reveal → decision", () => {
		const meta: ConversationMetadata = {
			...qualifiedBase,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			simulatorOfferDispatched: true,
		};
		expect(nextGate(meta)).toBe("decision");
	});
});

describe("decideShowGate — identify", () => {
	it("server-authored turn sempre mostra o gate", () => {
		expect(
			decideShowGate({
				gate: "identify",
				intent: "neutral",
				meta: qualifiedBase,
				isUserTurn: false,
			}),
		).toBe(true);
	});

	it("usuário colaborando (providing_info/ready) mostra", () => {
		expect(
			decideShowGate({
				gate: "identify",
				intent: "providing_info",
				meta: qualifiedBase,
				isUserTurn: true,
			}),
		).toBe(true);
		expect(
			decideShowGate({
				gate: "identify",
				intent: "ready_to_proceed",
				meta: qualifiedBase,
				isUserTurn: true,
			}),
		).toBe(true);
	});

	it("usuário perguntando/duvidando NÃO interrompe com o form", () => {
		expect(
			decideShowGate({
				gate: "identify",
				intent: "asking_question",
				meta: qualifiedBase,
				isUserTurn: true,
			}),
		).toBe(false);
		expect(
			decideShowGate({
				gate: "identify",
				intent: "expressing_doubt",
				meta: qualifiedBase,
				isUserTurn: true,
			}),
		).toBe(false);
	});
});
