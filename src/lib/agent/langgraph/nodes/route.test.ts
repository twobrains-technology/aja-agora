// FIX-358 — invariante I1 (goal doc): "descoberta nunca dispara sem
// identidade + valor". `readyForDiscovery` é o predicado PURO que a aresta
// condicional `routeAfterConverse` usa — testado isolado (TDD strict, sem
// grafo/DB) cobrindo a matriz completa de combinações.
import { describe, expect, it } from "vitest";
import type { FunnelState } from "../state";
import { readyForDiscovery } from "./route";

const BASE: FunnelState = {
	currentPersona: "auto",
	currentCategory: "auto",
	desireAsked: true,
	qualifyAnswers: { creditMax: 90_000 },
	identityCollected: true,
	searchDispatched: false,
	revealCompleted: false,
	decisionDispatched: false,
};

describe("FIX-358 — I1: readyForDiscovery (identidade + valor, nunca antes)", () => {
	it("pronto: identidade + creditMax + categoria + nunca buscado → true", () => {
		expect(readyForDiscovery(BASE)).toBe(true);
	});

	it("SEM identidade → false (I1, mesmo com valor e categoria prontos)", () => {
		expect(readyForDiscovery({ ...BASE, identityCollected: false })).toBe(false);
	});

	it("SEM creditMax → false (mesmo com identidade coletada)", () => {
		expect(readyForDiscovery({ ...BASE, qualifyAnswers: {} })).toBe(false);
	});

	it("SEM categoria → false", () => {
		expect(readyForDiscovery({ ...BASE, currentCategory: undefined })).toBe(false);
	});

	it("já buscado neste turno (searchDispatched=true) → false (idempotência, não rebusca)", () => {
		expect(readyForDiscovery({ ...BASE, searchDispatched: true })).toBe(false);
	});

	it("nada pronto (turno 1, só nome) → false", () => {
		expect(
			readyForDiscovery({
				...BASE,
				currentCategory: undefined,
				qualifyAnswers: {},
				identityCollected: false,
			}),
		).toBe(false);
	});

	it("creditMax=0 é um valor válido (não confundir com undefined)", () => {
		expect(readyForDiscovery({ ...BASE, qualifyAnswers: { creditMax: 0 } })).toBe(true);
	});
});

describe("FIX-360 — readyForDiscovery: troca de faixa de valor pós-reveal re-dispara", () => {
	const POS_REVEAL: FunnelState = {
		...BASE,
		searchDispatched: true,
		revealCompleted: true,
		discoveredCreditTarget: 90_000,
	};

	it("mesma faixa buscada (creditMax === discoveredCreditTarget) → false (idempotência)", () => {
		expect(readyForDiscovery(POS_REVEAL)).toBe(false);
	});

	it("faixa NOVA (creditMax !== discoveredCreditTarget) → true (re-descoberta legítima)", () => {
		expect(
			readyForDiscovery({
				...POS_REVEAL,
				qualifyAnswers: { ...POS_REVEAL.qualifyAnswers, creditMax: 130_000 },
			}),
		).toBe(true);
	});

	it("sem discoveredCreditTarget (descoberta anterior ao fix) → false (fail-safe, não reabre sem baseline)", () => {
		expect(readyForDiscovery({ ...POS_REVEAL, discoveredCreditTarget: undefined })).toBe(false);
	});
});
