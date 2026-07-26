// FIX-367 (bloco-i): `simulate_quota` nunca devolve `availableSlots` — quando o
// snapshot da oferta ancora num simulation_result (prioridade de lance,
// FIX-C2), o número de vagas real (que veio no recommendation_card/group_card
// do MESMO reveal) se perdia. Estas funções puras resolvem/preservam o dado
// sem nunca inventar (mesmo grupo, ou undefined).
import { describe, expect, it } from "vitest";
import {
	offerSnapshotFromArtifact,
	preserveAvailableSlotsAcrossResim,
	type RecommendedOfferSnapshot,
	resolveSnapshotAvailableSlots,
} from "./dial-payload";

function mustSnapshot(payload: Record<string, unknown>): RecommendedOfferSnapshot {
	const snap = offerSnapshotFromArtifact(payload);
	if (!snap) throw new Error("expected a usable snapshot in this fixture");
	return snap;
}

describe("FIX-367 — offerSnapshotFromArtifact extrai availableSlots quando o payload traz", () => {
	it("recommendation_card com availableSlots real → snapshot carrega o campo", () => {
		const snap = offerSnapshotFromArtifact({
			creditValue: 81_973,
			termMonths: 80,
			monthlyPayment: 1_200,
			groupId: "g1",
			availableSlots: 3,
		});
		expect(snap?.availableSlots).toBe(3);
	});

	it("simulation_result sem availableSlots → snapshot fica sem o campo (nunca inventa)", () => {
		const snap = offerSnapshotFromArtifact({
			creditValue: 81_973,
			termMonths: 80,
			monthlyPayment: 1_200,
			groupId: "g1",
		});
		expect(snap?.availableSlots).toBeUndefined();
	});

	it("availableSlots=0 não entra no snapshot (0 vagas não é dado utilizável pro card)", () => {
		const snap = offerSnapshotFromArtifact({
			creditValue: 81_973,
			termMonths: 80,
			monthlyPayment: 1_200,
			groupId: "g1",
			availableSlots: 0,
		});
		expect(snap?.availableSlots).toBeUndefined();
	});
});

describe("FIX-367 — resolveSnapshotAvailableSlots busca no payload de busca quando o anchor é simulation_result", () => {
	it("snapshot (anchor=simulation_result) sem availableSlots → cai pro recommendation_card do mesmo turno", () => {
		const simulationSnapshot = offerSnapshotFromArtifact({
			creditValue: 81_973,
			termMonths: 80,
			monthlyPayment: 1_200,
			groupId: "g1",
		});
		const resolved = resolveSnapshotAvailableSlots(
			simulationSnapshot,
			{ groupId: "g1", availableSlots: 2 },
			undefined,
		);
		expect(resolved).toBe(2);
	});

	it("sem recommendation_card nem group_card no turno → undefined (nunca inventa)", () => {
		const simulationSnapshot = offerSnapshotFromArtifact({
			creditValue: 81_973,
			termMonths: 80,
			monthlyPayment: 1_200,
			groupId: "g1",
		});
		expect(resolveSnapshotAvailableSlots(simulationSnapshot, undefined, undefined)).toBeUndefined();
	});

	it("snapshot já traz availableSlots (anchor=recommendation_card) → usa direto, ignora os payloads extras", () => {
		const recSnapshot = offerSnapshotFromArtifact({
			creditValue: 81_973,
			termMonths: 80,
			monthlyPayment: 1_200,
			groupId: "g1",
			availableSlots: 5,
		});
		expect(resolveSnapshotAvailableSlots(recSnapshot, { availableSlots: 999 }, undefined)).toBe(5);
	});
});

describe("FIX-367 — preserveAvailableSlotsAcrossResim mantém o número só do MESMO grupo", () => {
	it("re-simulação do MESMO grupo sem availableSlots novo → herda o valor anterior", () => {
		const previous = mustSnapshot({
			creditValue: 81_973,
			termMonths: 80,
			monthlyPayment: 1_200,
			groupId: "g1",
			availableSlots: 4,
		});
		const anchor = mustSnapshot({
			creditValue: 81_973,
			termMonths: 72,
			monthlyPayment: 1_300,
			groupId: "g1",
		});
		expect(preserveAvailableSlotsAcrossResim(anchor, previous)).toBe(4);
	});

	it("re-simulação de um grupo DIFERENTE → NÃO herda o número do grupo antigo", () => {
		const previous = mustSnapshot({
			creditValue: 81_973,
			termMonths: 80,
			monthlyPayment: 1_200,
			groupId: "g1",
			availableSlots: 4,
		});
		const anchor = mustSnapshot({
			creditValue: 90_000,
			termMonths: 72,
			monthlyPayment: 1_400,
			groupId: "g2",
		});
		expect(preserveAvailableSlotsAcrossResim(anchor, previous)).toBeUndefined();
	});

	it("anchor já traz availableSlots real → usa o novo, não o antigo", () => {
		const previous = mustSnapshot({
			creditValue: 81_973,
			termMonths: 80,
			monthlyPayment: 1_200,
			groupId: "g1",
			availableSlots: 4,
		});
		const anchor = mustSnapshot({
			creditValue: 81_973,
			termMonths: 72,
			monthlyPayment: 1_300,
			groupId: "g1",
			availableSlots: 7,
		});
		expect(preserveAvailableSlotsAcrossResim(anchor, previous)).toBe(7);
	});
});
