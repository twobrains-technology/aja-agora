// src/lib/telemetry/turn-trace.test.ts
//
// FIX-21 — Camada 1 (structural): dado um stream sintético de TurnEvents (ou de
// UI parts do writer web), o TurnTrace fecha um registro por turno com os campos
// certos. Turno com handoff e turno com erro também fecham. O tap passthrough
// NÃO engole eventos (asserção exigida pela regressão do FIX-21).
//
// 100% determinístico — deps (now/newId/sink) são injetadas. Zero DB, zero rede.

import { describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import {
	instrumentWriter,
	recordTurnEvent,
	recordUIPart,
	TurnTrace,
	type TurnTraceDeps,
	type TurnTraceRecord,
	traceTurnEvents,
} from "./turn-trace";

/** Deps determinísticas: relógio monotônico controlado + id fixo + sink capturador. */
function makeDeps(over: Partial<TurnTraceDeps> = {}): {
	deps: TurnTraceDeps;
	records: TurnTraceRecord[];
	tick: (ms: number) => void;
} {
	let clock = 1000;
	const records: TurnTraceRecord[] = [];
	const deps: TurnTraceDeps = {
		now: () => clock,
		newId: () => "trace-fixed-id",
		sink: (r) => {
			records.push(r);
		},
		...over,
	};
	return {
		deps,
		records,
		tick: (ms: number) => {
			clock += ms;
		},
	};
}

async function* fromArray(events: TurnEvent[]): AsyncGenerator<TurnEvent> {
	for (const ev of events) yield ev;
}

describe("TurnTrace — acumulador por turno (FIX-21)", () => {
	it("fecha um registro com os campos canônicos a partir de TurnEvents", () => {
		const { deps, tick } = makeDeps();
		const trace = new TurnTrace(
			{ conversationId: "conv-1", channel: "web", persona: "consultor-auto" },
			deps,
		);
		const events: TurnEvent[] = [
			{ type: "text-delta", text: "Olá! " },
			{ type: "text-delta", text: "vamos lá" },
			{ type: "tool-call", toolName: "search_groups", input: {}, toolCallId: "t1" },
			{ type: "tool-call", toolName: "simulate_quota", input: {}, toolCallId: "t2" },
			{
				type: "artifact",
				artifactType: "simulation_result",
				payload: {},
				toolCallId: "t2",
			},
			{ type: "lead-stage", stage: "engajado" },
			{ type: "gate", gate: "simulator-offer" },
			{ type: "finish", reason: "ok" },
		];
		for (const ev of events) recordTurnEvent(trace, ev);
		tick(1234);
		const r = trace.finalize();

		expect(r.conversationId).toBe("conv-1");
		expect(r.channel).toBe("web");
		expect(r.persona).toBe("consultor-auto");
		expect(r.gate).toBe("simulator-offer");
		expect(r.toolsCalled).toEqual(["search_groups", "simulate_quota"]);
		expect(r.toolCount).toBe(2);
		expect(r.artifactsEmitted).toEqual(["simulation_result"]);
		expect(r.artifactCount).toBe(1);
		expect(r.leadStage).toBe("engajado");
		expect(r.textChars).toBe("Olá! vamos lá".length);
		expect(r.finishReason).toBe("ok");
		expect(r.durationMs).toBe(1234);
		expect(r.traceId).toBe("trace-fixed-id");
		expect(r.handoff).toBe(false);
		expect(r.transitionedTo).toBeNull();
		// Back-compat (FIX-24): sem eventos `suppression`/`usage` no stream, os
		// campos seguem null/[] — turno legado não regride.
		expect(r.suppressed).toEqual([]);
		expect(r.cacheRead).toBeNull();
		expect(r.cacheWrite).toBeNull();
	});

	it("preenche suppressed/cacheRead/cacheWrite a partir de eventos suppression+usage (FIX-24)", () => {
		const { deps } = makeDeps();
		const trace = new TurnTrace({ conversationId: "conv-2", channel: "whatsapp" }, deps);
		const events: TurnEvent[] = [
			{ type: "text-delta", text: "ok" },
			{ type: "suppression", artifactType: "lead_form", reason: "reveal-loop" },
			{ type: "suppression", artifactType: "whatsapp_optin", reason: "whatsapp-optin" },
			{ type: "usage", cacheRead: 12000, cacheWrite: 3400 },
			{ type: "finish", reason: "ok" },
		];
		for (const ev of events) recordTurnEvent(trace, ev);
		const r = trace.finalize();

		expect(r.suppressed).toEqual(["lead_form", "whatsapp_optin"]);
		expect(r.cacheRead).toBe(12000);
		expect(r.cacheWrite).toBe(3400);
	});

	it("captura persona de transition (web/whatsapp sem persona inicial)", () => {
		const { deps } = makeDeps();
		const trace = new TurnTrace({ conversationId: "c", channel: "whatsapp" }, deps);
		recordTurnEvent(trace, {
			type: "transition",
			fromPersona: "concierge",
			toPersona: "consultor-imovel",
			toPersonaName: "Helena",
			toCategory: "imovel",
			bridgeText: "...",
		});
		const r = trace.finalize();
		expect(r.persona).toBe("consultor-imovel");
		expect(r.transitionedTo).toBe("consultor-imovel");
	});

	it("captura persona de meta-update", () => {
		const { deps } = makeDeps();
		const trace = new TurnTrace({ conversationId: "c", channel: "web" }, deps);
		recordTurnEvent(trace, {
			type: "meta-update",
			// biome-ignore lint/suspicious/noExplicitAny: meta parcial pro teste
			meta: { currentPersona: "consultor-moto" } as any,
		});
		expect(trace.finalize().persona).toBe("consultor-moto");
	});

	it("turno de handoff fecha com handoff=true e finishReason", () => {
		const { deps } = makeDeps();
		const trace = new TurnTrace({ conversationId: "c", channel: "whatsapp" }, deps);
		recordTurnEvent(trace, { type: "handoff", reason: "trigger satisfied" });
		recordTurnEvent(trace, { type: "finish", reason: "handoff" });
		const r = trace.finalize();
		expect(r.handoff).toBe(true);
		expect(r.finishReason).toBe("handoff");
	});

	it("finalize é idempotente — sink dispara uma única vez", () => {
		const { deps, records } = makeDeps();
		const trace = new TurnTrace({ conversationId: "c", channel: "web" }, deps);
		trace.finalize();
		trace.finalize();
		trace.finalize();
		expect(records).toHaveLength(1);
	});

	it("sink que lança NÃO propaga (telemetria nunca derruba o turno)", () => {
		const deps: TurnTraceDeps = {
			now: () => 0,
			newId: () => "x",
			sink: () => {
				throw new Error("disco cheio");
			},
		};
		const trace = new TurnTrace({ conversationId: "c", channel: "web" }, deps);
		expect(() => trace.finalize()).not.toThrow();
	});
});

describe("traceTurnEvents — tap passthrough sobre TurnEvents (WhatsApp)", () => {
	it("re-emite TODOS os eventos na ordem, sem engolir nenhum", async () => {
		const { deps, records } = makeDeps();
		const input: TurnEvent[] = [
			{ type: "text-delta", text: "oi" },
			{ type: "tool-call", toolName: "recommend_groups", input: {}, toolCallId: "t1" },
			{
				type: "artifact",
				artifactType: "recommendation_card",
				payload: {},
				toolCallId: "t1",
			},
			{ type: "finish", reason: "ok" },
		];
		const seen: TurnEvent[] = [];
		for await (const ev of traceTurnEvents(
			fromArray(input),
			{
				conversationId: "c",
				channel: "whatsapp",
			},
			deps,
		)) {
			seen.push(ev);
		}
		// Passthrough intacto: mesma sequência, mesmas referências.
		expect(seen).toEqual(input);
		// E o trace fechou no final (finally do generator).
		expect(records).toHaveLength(1);
		expect(records[0].toolsCalled).toEqual(["recommend_groups"]);
		expect(records[0].artifactsEmitted).toEqual(["recommendation_card"]);
		expect(records[0].channel).toBe("whatsapp");
	});

	it("fecha o trace mesmo quando o consumidor dá break cedo", async () => {
		const { deps, records } = makeDeps();
		const input: TurnEvent[] = [
			{ type: "text-delta", text: "a" },
			{ type: "text-delta", text: "b" },
			{ type: "finish", reason: "ok" },
		];
		for await (const ev of traceTurnEvents(
			fromArray(input),
			{
				conversationId: "c",
				channel: "whatsapp",
			},
			deps,
		)) {
			if (ev.type === "text-delta") break; // consumidor abandona no 1º evento
		}
		expect(records).toHaveLength(1);
	});
});

describe("instrumentWriter — tap por proxy do writer (web SSE)", () => {
	type WrittenPart = { type: string; [k: string]: unknown };

	function fakeWriter() {
		const written: WrittenPart[] = [];
		// Writer mínimo: só `write` + uma prop arbitrária pra provar passthrough.
		const writer = {
			write: (p: WrittenPart) => {
				written.push(p);
			},
			merge: vi.fn(),
		};
		return { writer, written };
	}

	it("reconstrói o trace a partir das UI parts e forwarda TODA escrita", () => {
		const { deps } = makeDeps();
		const trace = new TurnTrace(
			{ conversationId: "c", channel: "web", persona: "consultor-auto" },
			deps,
		);
		const { writer, written } = fakeWriter();
		// biome-ignore lint/suspicious/noExplicitAny: writer fake mínimo
		const traced = instrumentWriter(writer as any, trace) as unknown as {
			write: (p: WrittenPart) => void;
		};

		const parts: WrittenPart[] = [
			{ type: "text-start", id: "1" },
			{ type: "text-delta", id: "1", delta: "Pronto, " },
			{ type: "text-delta", id: "1", delta: "achei 3 grupos" },
			{ type: "text-end", id: "1" },
			{ type: "data-tool", id: "t1", data: { tool: "search_groups" } },
			{ type: "data-artifact", id: "t1", data: { type: "comparison_table", payload: {} } },
			{
				type: "data-gate",
				id: "g1",
				data: { kind: "chips", gate: "simulator-offer", options: [] },
			},
		];
		for (const p of parts) traced.write(p);

		// Passthrough byte-idêntico — nada engolido nem reordenado.
		expect(written).toEqual(parts);

		const r = trace.finalize();
		expect(r.toolsCalled).toEqual(["search_groups"]);
		expect(r.artifactsEmitted).toEqual(["comparison_table"]);
		expect(r.gate).toBe("simulator-offer");
		expect(r.textChars).toBe("Pronto, achei 3 grupos".length);
		expect(r.persona).toBe("consultor-auto");
	});

	it("captura transition e handoff das UI parts", () => {
		const { deps } = makeDeps();
		const trace = new TurnTrace({ conversationId: "c", channel: "web" }, deps);
		const { writer } = fakeWriter();
		// biome-ignore lint/suspicious/noExplicitAny: writer fake
		const traced = instrumentWriter(writer as any, trace) as unknown as {
			write: (p: WrittenPart) => void;
		};
		traced.write({ type: "data-transition", id: "x", data: { toPersona: "consultor-imovel" } });
		traced.write({ type: "data-handoff", id: "y", data: { reason: "humano" } });
		const r = trace.finalize();
		expect(r.transitionedTo).toBe("consultor-imovel");
		expect(r.persona).toBe("consultor-imovel");
		expect(r.handoff).toBe(true);
	});

	it("recordUIPart ignora parts malformadas sem lançar", () => {
		const { deps } = makeDeps();
		const trace = new TurnTrace({ conversationId: "c", channel: "web" }, deps);
		expect(() => {
			recordUIPart(trace, { type: "data-tool" }); // sem data
			recordUIPart(trace, { type: "data-artifact", data: {} }); // sem type
			recordUIPart(trace, {}); // sem type
			recordUIPart(trace, { type: "text-delta" }); // sem delta
		}).not.toThrow();
		const r = trace.finalize();
		expect(r.toolsCalled).toEqual([]);
		expect(r.artifactsEmitted).toEqual([]);
		expect(r.textChars).toBe(0);
	});
});
