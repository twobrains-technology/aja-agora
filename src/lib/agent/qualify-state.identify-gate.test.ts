import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate } from "./qualify-state";

// Gate "identify" — D1 (docs/jornada/CONTEXT.md): a Bevi exige CPF+celular+LGPD
// ANTES de simular. A identidade é coletada ao FIM do passo 2 (depois de
// lance/lance-embutido, antes da busca), no gancho do docx: "Com essas
// informações, a Aja Agora vai analisar várias administradoras…".

const qualifiedBase: ConversationMetadata = {
	experiencePrev: "first",
	qualifyConsented: true,
	qualifyAnswers: { creditMax: 80_000, prazoMeses: 12, hasLance: "no" },
};

describe("nextGate — identify entra entre a qualificação e a busca", () => {
	it("qualificação completa (lance=no) SEM identidade → identify", () => {
		expect(nextGate(qualifiedBase)).toBe("identify");
	});

	it("lance=yes + lance-embutido respondido SEM identidade → identify", () => {
		const meta: ConversationMetadata = {
			...qualifiedBase,
			qualifyAnswers: {
				...qualifiedBase.qualifyAnswers,
				hasLance: "yes",
				lanceValue: 30_000,
				lanceEmbutido: true,
				lanceEmbutidoPercent: 30,
			},
		};
		expect(nextGate(meta)).toBe("identify");
	});

	it("lance=yes SEM lance-embutido respondido → lance-embutido vem ANTES de identify", () => {
		const meta: ConversationMetadata = {
			...qualifiedBase,
			// lanceValue já respondido (gate lance-value tem suite própria)
			qualifyAnswers: { ...qualifiedBase.qualifyAnswers, hasLance: "yes", lanceValue: 30_000 },
		};
		expect(nextGate(meta)).toBe("lance-embutido");
	});

	it("COM identidade coletada → search (descoberta liberada)", () => {
		const meta: ConversationMetadata = { ...qualifiedBase, identityCollected: true };
		expect(nextGate(meta)).toBe("search");
	});

	it("identify NÃO aparece antes da qualificação completa", () => {
		const meta: ConversationMetadata = {
			experiencePrev: "first",
			qualifyConsented: true,
			qualifyAnswers: { creditMax: 80_000 },
		};
		expect(nextGate(meta)).toBe("timeframe");
	});

	it("fluxo pós-busca não regride: search dispatched + reveal → decision", () => {
		const meta: ConversationMetadata = {
			...qualifiedBase,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
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
