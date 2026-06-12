// Camada 1 — FIX-C2/C5 (auditoria Kairo 2026-06-11): o FIX-6 coagia só
// creditValue/term/monthly do dial — os params de LANCE (historicalWinningBidPct,
// maxEmbutidoPct) continuavam na mão do modelo, e o mês de referência nem
// existia. Resultado: dial com 74% e "R$ 115 mil do bolso" pra uma oferta cujo
// embutido real era 49,28% com contemplação ~6 meses. C2: o servidor coage
// TODOS os números de lance a partir do snapshot da oferta. C5: defaults do
// PERFIL — mês-alvo inicial = prazo declarado; lance declarado vai no payload
// pro componente confrontar.

import { describe, expect, it } from "vitest";
import { coerceDialPayload, offerSnapshotFromArtifact } from "./dial-payload";

// Payload do simulation_result como emitido no reveal da jornada BB
const SIM_PAYLOAD = {
	administradora: "BANCO DO BRASIL",
	category: "auto",
	creditValue: 262_309.8,
	termMonths: 34,
	monthlyPayment: 9_828.92,
	lanceScenario: { lancePercent: 49.28, expectedTermMonths: 6 },
	embeddedBid: {
		percent: 49.28,
		embeddedBidValue: 129_266.27,
		receivedCredit: 133_043.53,
		necessaryBidToContemplate: 129_266.27,
	},
};

describe("C2 — snapshot captura os dados de LANCE da oferta real", () => {
	it("extrai lanceRefPct/lanceRefMonth/maxEmbutidoPct do payload do simulation_result", () => {
		const snap = offerSnapshotFromArtifact(SIM_PAYLOAD);
		expect(snap).not.toBeNull();
		// lance de referência: necessaryBidToContemplate em % da carta (dado real)
		expect(snap?.lanceRefPct).toBeCloseTo(49.28, 1);
		expect(snap?.lanceRefMonth).toBe(6);
		expect(snap?.maxEmbutidoPct).toBeCloseTo(49.28, 1);
	});

	it("sem necessaryBid → cai pro lancePercent do lanceScenario", () => {
		const snap = offerSnapshotFromArtifact({
			...SIM_PAYLOAD,
			embeddedBid: { percent: 30, embeddedBidValue: 1, receivedCredit: 1 },
		});
		expect(snap?.lanceRefPct).toBeCloseTo(49.28, 1);
		expect(snap?.maxEmbutidoPct).toBe(30);
	});

	it("artifact sem dados de lance (group_card) → snapshot só com os 3 números base", () => {
		const snap = offerSnapshotFromArtifact({
			creditValue: 100_000,
			termMonths: 60,
			monthlyPayment: 1_500,
		});
		expect(snap).not.toBeNull();
		expect(snap?.lanceRefPct).toBeUndefined();
		expect(snap?.lanceRefMonth).toBeUndefined();
	});
});

describe("C2 — coerceDialPayload força os números de lance da oferta (modelo não manda mais)", () => {
	const snapshot = offerSnapshotFromArtifact(SIM_PAYLOAD);
	if (!snapshot) throw new Error("snapshot do payload de teste deveria existir");

	it("sobrescreve historicalWinningBidPct/referenceMonth/maxEmbutidoPct alucinados pelo modelo", () => {
		const out = coerceDialPayload(
			{ historicalWinningBidPct: 40, maxEmbutidoPct: 30, initialTargetMonth: 6 },
			snapshot,
		);
		expect(out.historicalWinningBidPct).toBeCloseTo(49.28, 1);
		expect(out.referenceMonth).toBe(6);
		expect(out.maxEmbutidoPct).toBeCloseTo(49.28, 1);
		// números base seguem coagidos (FIX-6)
		expect(out.creditValue).toBe(262_309.8);
		expect(out.termMonths).toBe(34);
	});

	it("snapshot sem dados de lance → mantém o que o modelo passou (não inventa)", () => {
		const base = offerSnapshotFromArtifact({
			creditValue: 100_000,
			termMonths: 60,
			monthlyPayment: 1_500,
		});
		const out = coerceDialPayload({ historicalWinningBidPct: 40, initialTargetMonth: 6 }, base);
		expect(out.historicalWinningBidPct).toBe(40);
		expect(out.referenceMonth).toBeUndefined();
	});
});

describe("C5 — defaults do PERFIL declarado", () => {
	const snapshot = offerSnapshotFromArtifact(SIM_PAYLOAD);

	it("modelo não passou mês-alvo → abre no prazo DECLARADO do usuário (não em 6 hardcoded)", () => {
		const out = coerceDialPayload({}, snapshot, { prazoMeses: 27 });
		expect(out.initialTargetMonth).toBe(27);
	});

	it("prazo declarado maior que o prazo do grupo → clampa no term", () => {
		const out = coerceDialPayload({}, snapshot, { prazoMeses: 48 });
		expect(out.initialTargetMonth).toBe(34);
	});

	it("modelo passou mês explícito (what-if do usuário) → respeita o modelo", () => {
		const out = coerceDialPayload({ initialTargetMonth: 9 }, snapshot, { prazoMeses: 27 });
		expect(out.initialTargetMonth).toBe(9);
	});

	it("sem declarado e sem modelo → fallback min(6, term) de antes", () => {
		const out = coerceDialPayload({}, snapshot, {});
		expect(out.initialTargetMonth).toBe(6);
	});

	it("lance declarado entra no payload pro componente confrontar (cobre/não cobre)", () => {
		const out = coerceDialPayload({}, snapshot, { prazoMeses: 27, lanceValue: 117_000 });
		expect(out.declaredLanceValue).toBe(117_000);
	});
});

// FIX-40 (API nova Bevi 2026-06-12): a oferta de parceiro ganhou `lanceMedio` (R$
// do grupo). Quando um artifact-âncora carrega esse valor (avgBidValue), o snapshot
// o captura e o dial ganha a âncora de lance REAL do grupo — defensivo, NUNCA
// inventa quando o artifact não a tem (regra D11 / padrão FIX-C2).
describe("FIX-40 — âncora de lance médio do grupo (avgBidValue) no dial", () => {
	it("offerSnapshotFromArtifact: captura avgBidValue do payload quando presente (>0)", () => {
		const snap = offerSnapshotFromArtifact({
			creditValue: 100_000,
			termMonths: 60,
			monthlyPayment: 1_500,
			avgBidValue: 69_361.27,
		});
		expect(snap?.avgBidValue).toBe(69_361.27);
	});

	it("offerSnapshotFromArtifact: artifact SEM avgBidValue → snapshot sem âncora (nunca inventa)", () => {
		const snap = offerSnapshotFromArtifact({
			creditValue: 100_000,
			termMonths: 60,
			monthlyPayment: 1_500,
		});
		expect(snap?.avgBidValue).toBeUndefined();
	});

	it("offerSnapshotFromArtifact: avgBidValue 0/negativo/não-finito → ignorado (defensivo)", () => {
		for (const bad of [0, -1, Number.NaN, "abc"]) {
			const snap = offerSnapshotFromArtifact({
				creditValue: 100_000,
				termMonths: 60,
				monthlyPayment: 1_500,
				avgBidValue: bad as number,
			});
			expect(snap?.avgBidValue).toBeUndefined();
		}
	});

	it("coerceDialPayload: propaga avgBidValue do snapshot pro payload do dial", () => {
		const snap = offerSnapshotFromArtifact({
			creditValue: 100_000,
			termMonths: 60,
			monthlyPayment: 1_500,
			avgBidValue: 69_361.27,
		});
		const out = coerceDialPayload({ initialTargetMonth: 6 }, snap);
		expect(out.avgBidValue).toBe(69_361.27);
	});

	it("coerceDialPayload: snapshot SEM avgBidValue → payload sem a âncora (não inventa)", () => {
		const snap = offerSnapshotFromArtifact({
			creditValue: 100_000,
			termMonths: 60,
			monthlyPayment: 1_500,
		});
		const out = coerceDialPayload({ initialTargetMonth: 6 }, snap);
		expect("avgBidValue" in out).toBe(false);
	});
});
