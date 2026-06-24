import { describe, expect, it } from "vitest";
import {
	computePersonaSegments,
	computeSignals,
	type SignalsArtifact,
	type SignalsMessage,
} from "./signals";

const ts = (s: string) => new Date(s);

const userMsg = (id: string, content: string): SignalsMessage => ({
	id,
	role: "user",
	content,
	createdAt: ts("2026-05-08T10:00:00Z"),
});

const assistantMsg = (id: string, content: string): SignalsMessage => ({
	id,
	role: "assistant",
	content,
	createdAt: ts("2026-05-08T10:00:00Z"),
});

describe("computeSignals — replyRate", () => {
	it("é 0.2 quando 1 user / 5 assistant (taxa real)", () => {
		const messages: SignalsMessage[] = [
			userMsg("u1", "oi"),
			...Array.from({ length: 5 }, (_, i) => assistantMsg(`a${i}`, "x")),
		];
		const r = computeSignals({
			metadata: null,
			channel: "web",
			messages,
			artifacts: [],
			lead: null,
		});
		expect(r.replyRate).toBeCloseTo(0.2);
	});

	it("é capado em 1 quando user > assistant (não vira > 1)", () => {
		const messages: SignalsMessage[] = [
			userMsg("u1", "x"),
			userMsg("u2", "x"),
			userMsg("u3", "x"),
			assistantMsg("a1", "x"),
		];
		const r = computeSignals({
			metadata: null,
			channel: "web",
			messages,
			artifacts: [],
			lead: null,
		});
		expect(r.replyRate).toBe(1);
	});

	it("retorna 1 quando não tem assistant turns (evita divisão por zero)", () => {
		const r = computeSignals({
			metadata: null,
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
		});
		expect(r.replyRate).toBe(1);
	});
});

describe("computeSignals — qualifyCoverage por categoria", () => {
	it("imovel exige creditRange + prazoMeses", () => {
		const semNada = computeSignals({
			metadata: { currentCategory: "imovel" },
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
		});
		expect(semNada.qualifyCoverage).toBe(0);
		expect(semNada.qualifyMissing).toEqual(
			expect.arrayContaining(["imovel.creditRange", "imovel.prazoMeses"]),
		);

		const completo = computeSignals({
			metadata: {
				currentCategory: "imovel",
				qualifyAnswers: { creditMin: 100000, prazoMeses: 60 },
			},
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
		});
		expect(completo.qualifyCoverage).toBe(1);
		expect(completo.qualifyMissing).toEqual([]);
	});

	it("auto exige creditRange + hasLance — só credito = 0.5", () => {
		const r = computeSignals({
			metadata: {
				currentCategory: "auto",
				qualifyAnswers: { creditMin: 50000, creditMax: 80000 },
			},
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
		});
		expect(r.qualifyCoverage).toBe(0.5);
		expect(r.qualifyMissing).toEqual(["auto.hasLance"]);
	});

	it("retorna 0 sem categoria — não dá pra exigir nada sem saber o que precisa", () => {
		const r = computeSignals({
			metadata: {},
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
		});
		expect(r.qualifyCoverage).toBe(0);
		expect(r.qualifyMissing).toEqual([]);
	});
});

describe("computeSignals — numbersInTextFlagged (cross-check anti-alucinação)", () => {
	it("flagga R$ 850 sem artifact correspondente", () => {
		const r = computeSignals({
			metadata: null,
			channel: "web",
			messages: [assistantMsg("a1", "A parcela é de R$ 850 ao mês")],
			artifacts: [],
			lead: null,
		});
		expect(r.numbersInTextFlagged).toHaveLength(1);
	});

	it("não flagga quando artifact tem o valor (texto corresponde a fonte)", () => {
		const r = computeSignals({
			metadata: null,
			channel: "web",
			messages: [assistantMsg("a1", "A parcela é de R$ 850 ao mês")],
			artifacts: [{ messageId: "a1", type: "simulation_result", payload: { parcela: 850 } }],
			lead: null,
		});
		expect(r.numbersInTextFlagged).toHaveLength(0);
	});

	it("ignora números em mensagens do user (só policia o agente)", () => {
		const r = computeSignals({
			metadata: null,
			channel: "web",
			messages: [userMsg("u1", "Quero pagar R$ 500")],
			artifacts: [],
			lead: null,
		});
		expect(r.numbersInTextFlagged).toHaveLength(0);
	});

	it("não flagga 18% quando artifact tem 0.18 (forma decimal vs integer percent)", () => {
		const r = computeSignals({
			metadata: null,
			channel: "web",
			messages: [assistantMsg("a1", "A taxa é 18% ao ano")],
			artifacts: [{ messageId: "a1", type: "simulation_result", payload: { taxa: 0.18 } }],
			lead: null,
		});
		expect(r.numbersInTextFlagged).toHaveLength(0);
	});
});

describe("computePersonaSegments — multi-persona", () => {
	const assistantWithPersona = (id: string, personaId: string | null): SignalsMessage => ({
		id,
		role: "assistant",
		content: "x",
		createdAt: ts("2026-05-08T10:00:00Z"),
		personaId,
	});

	it("agrupa turnos consecutivos da mesma persona em um único segmento", () => {
		const segs = computePersonaSegments([
			assistantWithPersona("a1", "helena"),
			assistantWithPersona("a2", "helena"),
		]);
		expect(segs).toHaveLength(1);
		expect(segs[0]).toMatchObject({ personaId: "helena", turnCount: 2 });
	});

	it("quebra em segmentos quando persona muda", () => {
		const segs = computePersonaSegments([
			assistantWithPersona("a1", "helena"),
			assistantWithPersona("a2", "helena"),
			assistantWithPersona("a3", "rafael"),
			assistantWithPersona("a4", "rafael"),
		]);
		expect(segs).toHaveLength(2);
		expect(segs[0]).toMatchObject({ personaId: "helena", turnCount: 2 });
		expect(segs[1]).toMatchObject({ personaId: "rafael", turnCount: 2 });
	});

	it("ignora user/system e mensagens sem personaId (legacy)", () => {
		const segs = computePersonaSegments([
			userMsg("u1", "x"),
			assistantMsg("a1", "x"), // sem personaId
			assistantWithPersona("a2", "helena"),
		]);
		expect(segs).toHaveLength(1);
		expect(segs[0].personaId).toBe("helena");
	});

	it("retorna [] quando todas as mensagens são legacy (sem personaId)", () => {
		const segs = computePersonaSegments([assistantMsg("a1", "x"), assistantMsg("a2", "y")]);
		expect(segs).toEqual([]);
	});
});

describe("computeSignals — qualifyCoverage agregada multi-categoria", () => {
	it("agrega filled/required entre currentCategory + qualifyAnswersByCategory", () => {
		const r = computeSignals({
			metadata: {
				currentCategory: "auto",
				personasSeen: ["imovel", "auto"],
				qualifyAnswers: { creditMin: 70000, hasLance: "yes" },
				qualifyAnswersByCategory: {
					imovel: { creditMin: 250000, prazoMeses: 120 },
				},
			},
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
		});
		// imovel: creditRange ✓ + prazoMeses ✓ = 2/2
		// auto: creditRange ✓ + hasLance ✓ = 2/2
		// agregado = 4/4 = 1
		expect(r.qualifyCoverage).toBe(1);
		expect(r.qualifyMissing).toEqual([]);
	});

	it("missing fields são prefixados com a categoria", () => {
		const r = computeSignals({
			metadata: {
				currentCategory: "auto",
				personasSeen: ["imovel"],
				qualifyAnswers: { creditMin: 70000 }, // hasLance ausente
				qualifyAnswersByCategory: {
					imovel: { creditMin: 250000 }, // prazoMeses ausente
				},
			},
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
		});
		expect(r.qualifyCoverage).toBe(0.5); // 2/4
		expect(r.qualifyMissing).toEqual(
			expect.arrayContaining(["imovel.prazoMeses", "auto.hasLance"]),
		);
	});
});

describe("computeSignals — dropOffGate (integração com qualify-state)", () => {
	it("retorna o próximo gate pendente conforme nextGate()", () => {
		const r = computeSignals({
			metadata: {
				currentCategory: "imovel",
				experiencePrev: "first",
				qualifyConsented: true,
				// FIX-53: o gate `identify` subiu para antes de `credit`. Com a
				// identidade já coletada, o próximo gate pendente após o valor é o
				// prazo (timeframe) — que é o que este teste valida.
				identityCollected: true,
				qualifyAnswers: { creditMax: 200000 },
			},
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
		});
		expect(r.dropOffGate).toBe("timeframe");
	});

	it("retorna null sem categoria (sem fluxo de gates)", () => {
		const r = computeSignals({
			metadata: {},
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
		});
		expect(r.dropOffGate).toBeNull();
	});
});
