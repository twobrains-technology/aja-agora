import { describe, expect, it } from "vitest";
import type { TurnTraceRecord } from "@/lib/telemetry/turn-trace";
import { PROFUNDIDADE_MAXIMA, profundidadeDoGate, scoresDoTurno } from "./funil-scores";

function record(over: Partial<TurnTraceRecord> = {}): TurnTraceRecord {
	return {
		traceId: "t1",
		conversationId: "c1",
		channel: "web",
		persona: null,
		gate: null,
		toolsCalled: [],
		toolCount: 0,
		artifactsEmitted: [],
		artifactCount: 0,
		suppressed: [],
		cacheRead: null,
		cacheWrite: null,
		textChars: 10,
		handoff: false,
		transitionedTo: null,
		leadStage: null,
		durationMs: 100,
		finishReason: null,
		startedAt: 0,
		...over,
	};
}

const porNome = (r: TurnTraceRecord) => new Map(scoresDoTurno(r).map((s) => [s.name, s]));

describe("scoresDoTurno — o funil vira dimensão", () => {
	it("emite o gate como CATEGORICAL (é o que a Metrics API sabe agrupar)", () => {
		const s = porNome(record({ gate: "credit" })).get("gate");
		expect(s).toEqual({ name: "gate", value: "credit", dataType: "CATEGORICAL" });
	});

	it("emite a profundidade como NUMERIC pra dar conversão por sessão", () => {
		expect(porNome(record({ gate: "credit" })).get("funil_passo")?.value).toBe(4);
		expect(porNome(record({ gate: "contract" })).get("funil_passo")?.value).toBe(
			PROFUNDIDADE_MAXIMA,
		);
	});

	it("não pontua profundidade em doubts-wait — é pausa, não posição no funil", () => {
		const m = porNome(record({ gate: "doubts-wait" }));
		expect(m.get("gate")?.value).toBe("doubts-wait");
		expect(m.has("funil_passo")).toBe(false);
	});

	it("gate desconhecido não inventa profundidade", () => {
		expect(profundidadeDoGate("gate-que-nao-existe")).toBeNull();
		expect(porNome(record({ gate: "gate-que-nao-existe" })).has("funil_passo")).toBe(false);
	});

	it("turno sem gate não emite score de funil (ausência ≠ zero)", () => {
		const m = porNome(record({ gate: null }));
		expect(m.has("gate")).toBe(false);
		expect(m.has("funil_passo")).toBe(false);
	});
});

describe("scoresDoTurno — sinais de defeito do agente", () => {
	it("marca turno mudo quando o agente não escreveu nada", () => {
		expect(porNome(record({ textChars: 0 })).get("turno_mudo")?.value).toBe(1);
		expect(porNome(record({ textChars: 1 })).get("turno_mudo")?.value).toBe(0);
	});

	it("marca supressão de artefato e diz QUAIS guards bateram", () => {
		const s = porNome(record({ suppressed: ["reveal-loop", "post-closure"] })).get(
			"artefato_suprimido",
		);
		expect(s?.value).toBe(1);
		expect(s?.comment).toBe("reveal-loop, post-closure");
	});

	it("turno limpo reporta supressão zero, sem comment", () => {
		const s = porNome(record()).get("artefato_suprimido");
		expect(s?.value).toBe(0);
		expect(s?.comment).toBeUndefined();
	});

	it("registra handoff, tools e finish reason", () => {
		const m = porNome(
			record({
				handoff: true,
				toolCount: 2,
				toolsCalled: ["buscarOfertas", "simular"],
				finishReason: "tool-error-recovered",
			}),
		);
		expect(m.get("handoff")?.value).toBe(1);
		expect(m.get("tools_chamadas")?.value).toBe(2);
		expect(m.get("tools_chamadas")?.comment).toBe("buscarOfertas, simular");
		expect(m.get("finish_reason")).toEqual({
			name: "finish_reason",
			value: "tool-error-recovered",
			dataType: "CATEGORICAL",
		});
	});

	it("omite campos não observados em vez de mandar null", () => {
		const m = porNome(record());
		expect(m.has("finish_reason")).toBe(false);
		expect(m.has("lead_stage")).toBe(false);
		expect(m.has("persona")).toBe(false);
	});

	it("todo score booleano usa 1/0 — a API do Langfuse recusa outro valor", () => {
		const s = scoresDoTurno(record({ handoff: true, textChars: 0, suppressed: ["x"] }));
		for (const score of s.filter((x) => x.dataType === "BOOLEAN")) {
			expect([0, 1]).toContain(score.value);
		}
	});
});
