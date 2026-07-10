// FIX-246 (rodada 3, Fable r2 — causa-raiz): emissão SERVER-SIDE determinística
// do card `scarcity` precisa resolver o groupId da oferta recomendada MUITO
// depois do turno do reveal (o `RevealGroupIndex` daquele turno já não existe
// mais). `offerSnapshotFromArtifact` é o ÚNICO ponto que popula
// `meta.recommendedOffer` (no reveal E no what-if) — captura o `groupId` aqui
// pra ele sobreviver ponta-a-ponta no meta, igual aos demais campos do snapshot.

import { describe, expect, it } from "vitest";
import { offerSnapshotFromArtifact } from "./dial-payload";

describe("FIX-246 — offerSnapshotFromArtifact captura groupId do artifact âncora", () => {
	it("extrai groupId quando o payload do recommendation_card/comparison_table o carrega", () => {
		const snap = offerSnapshotFromArtifact({
			groupId: "grupo-real-123",
			administradora: "CANOPUS",
			creditValue: 90_000,
			termMonths: 72,
			monthlyPayment: 812,
		});
		expect(snap?.groupId).toBe("grupo-real-123");
	});

	it("sem groupId no payload, snapshot fica sem a chave (nunca fabrica um id)", () => {
		const snap = offerSnapshotFromArtifact({
			creditValue: 90_000,
			termMonths: 72,
			monthlyPayment: 812,
		});
		expect(snap?.groupId).toBeUndefined();
	});
});
