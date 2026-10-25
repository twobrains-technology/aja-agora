import { describe, expect, it } from "vitest";
import { coerceDialPayload, offerSnapshotFromArtifact } from "./dial-payload";

/** Um simulation_result real, do tamanho dos que a busca devolve. */
const SIMULACAO = {
	administradora: "CANOPUS",
	category: "imovel",
	creditValue: 80000,
	termMonths: 120,
	monthlyPayment: 700,
	groupId: "6abfaeca-0000-0000-0000-0000000074cc",
	lanceScenario: { lancePercent: 25, expectedTermMonths: 30 },
};

describe("teto do lance embutido no snapshot da oferta", () => {
	// `maxEmbutidoPct: 0` é a RECUSA ao embutido gravada pelo plano
	// (plan-estimate.ts) — zero é valor, não ausência. Se ele sumir aqui, o dial
	// cai no teto padrão de 30% e o embutido consome parte da carta de quem
	// disse não.
	it("recusa ao embutido (percent: 0) sobrevive ao snapshot como zero", () => {
		const snapshot = offerSnapshotFromArtifact({
			...SIMULACAO,
			embeddedBid: { percent: 0, necessaryBidToContemplate: null },
		});
		expect(snapshot).not.toBeNull();
		expect(snapshot?.maxEmbutidoPct).toBe(0);
	});

	it("recusa ao embutido (percent: 0) continua zero no payload do dial", () => {
		const snapshot = offerSnapshotFromArtifact({
			...SIMULACAO,
			embeddedBid: { percent: 0, necessaryBidToContemplate: null },
		});
		const payload = coerceDialPayload({ initialTargetMonth: 30 }, snapshot);
		expect(payload.maxEmbutidoPct).toBe(0);
	});

	it("teto positivo continua chegando ao payload do dial", () => {
		const snapshot = offerSnapshotFromArtifact({
			...SIMULACAO,
			embeddedBid: { percent: 30, necessaryBidToContemplate: 20000 },
		});
		expect(snapshot?.maxEmbutidoPct).toBe(30);
		const payload = coerceDialPayload({ initialTargetMonth: 30 }, snapshot);
		expect(payload.maxEmbutidoPct).toBe(30);
	});

	it("ausência de embeddedBid não vira zero: teto fica indefinido e some do payload", () => {
		const snapshot = offerSnapshotFromArtifact(SIMULACAO);
		expect(snapshot).not.toBeNull();
		expect(snapshot?.maxEmbutidoPct).toBeUndefined();
		const payload = coerceDialPayload({ initialTargetMonth: 30 }, snapshot);
		expect(payload).not.toHaveProperty("maxEmbutidoPct");
	});

	it("percent indefinido dentro de embeddedBid não vira zero", () => {
		const snapshot = offerSnapshotFromArtifact({
			...SIMULACAO,
			embeddedBid: { necessaryBidToContemplate: 20000 },
		});
		expect(snapshot?.maxEmbutidoPct).toBeUndefined();
		const payload = coerceDialPayload({ initialTargetMonth: 30 }, snapshot);
		expect(payload).not.toHaveProperty("maxEmbutidoPct");
	});
});
