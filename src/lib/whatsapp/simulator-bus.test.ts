/**
 * Testes do simulator-bus: helper de detecção de waId simulado + canais
 * cliente/atendente. Garante que mensagens publicadas chegam aos subscribers
 * exatos e que isSimulatedWaId não classifica wrong um número real.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isSimulatedWaId,
	publishToAttendant,
	publishToClient,
	type SimulatorClientEvent,
	type SimulatorMessage,
	subscribeToAttendant,
	subscribeToClient,
} from "./simulator-bus";

describe("isSimulatedWaId", () => {
	it("identifica waId simulado pelo prefixo SIM-", () => {
		expect(isSimulatedWaId("SIM-abc")).toBe(true);
		expect(isSimulatedWaId("SIM-0a1b2c3d-4e5f-6789-aaaa-bbbbccccdddd")).toBe(true);
	});

	it("NÃO confunde número real (que pode conter 'sim' ou começar com 5511)", () => {
		expect(isSimulatedWaId("5511999999999")).toBe(false);
		expect(isSimulatedWaId("simulado")).toBe(false); // minúsculo não conta
		expect(isSimulatedWaId("sim-abc")).toBe(false); // case-sensitive proposital
		expect(isSimulatedWaId("")).toBe(false);
		expect(isSimulatedWaId(null)).toBe(false);
		expect(isSimulatedWaId(undefined)).toBe(false);
	});
});

describe("publishToClient / subscribeToClient", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("entrega evento text ao subscriber do mesmo waId", () => {
		const waId = `SIM-${crypto.randomUUID()}`;
		const received: SimulatorClientEvent[] = [];
		const unsub = subscribeToClient(waId, (e) => received.push(e));

		publishToClient(waId, { type: "text", text: "oi" });

		expect(received).toHaveLength(1);
		expect(received[0].type).toBe("text");
		if (received[0].type === "text") expect(received[0].text).toBe("oi");
		expect(received[0].id).toMatch(/^[0-9a-f-]{36}$/);
		expect(received[0].createdAt).toBeTypeOf("string");

		unsub();
	});

	it("isola eventos por waId — outro waId não recebe", () => {
		const a = `SIM-${crypto.randomUUID()}`;
		const b = `SIM-${crypto.randomUUID()}`;
		const recA: SimulatorClientEvent[] = [];
		const recB: SimulatorClientEvent[] = [];
		const ua = subscribeToClient(a, (e) => recA.push(e));
		const ub = subscribeToClient(b, (e) => recB.push(e));

		publishToClient(a, { type: "text", text: "pra A" });

		expect(recA).toHaveLength(1);
		expect(recB).toHaveLength(0);

		ua();
		ub();
	});

	it("typing e interactive são entregues corretamente", () => {
		const waId = `SIM-${crypto.randomUUID()}`;
		const events: SimulatorClientEvent[] = [];
		const unsub = subscribeToClient(waId, (e) => events.push(e));

		publishToClient(waId, { type: "typing", on: true });
		publishToClient(waId, {
			type: "interactive",
			interactive: { type: "button", body: { text: "?" }, action: { buttons: [] } },
		});

		expect(events).toHaveLength(2);
		expect(events[0].type).toBe("typing");
		if (events[0].type === "typing") expect(events[0].on).toBe(true);
		expect(events[1].type).toBe("interactive");

		unsub();
	});

	it("unsubscribe para de receber eventos novos", () => {
		const waId = `SIM-${crypto.randomUUID()}`;
		const events: SimulatorClientEvent[] = [];
		const unsub = subscribeToClient(waId, (e) => events.push(e));

		publishToClient(waId, { type: "text", text: "antes" });
		unsub();
		publishToClient(waId, { type: "text", text: "depois" });

		expect(events).toHaveLength(1);
	});
});

describe("publishToAttendant — retrocompat + flag simulated", () => {
	it("entrega mensagem com flag simulated quando vinda de conversa simulada", () => {
		const phone = "5511000000001";
		const received: SimulatorMessage[] = [];
		const unsub = subscribeToAttendant(phone, (m) => received.push(m));

		publishToAttendant(phone, "Cliente simulado quer falar", { simulated: true });
		publishToAttendant(phone, "Cliente real", {});

		expect(received).toHaveLength(2);
		expect(received[0].simulated).toBe(true);
		expect(received[0].text).toBe("Cliente simulado quer falar");
		expect(received[1].simulated).toBeUndefined();

		unsub();
	});

	it("entrega payload interactive (botões 'Vou atender' da mesa) junto com o texto", () => {
		const phone = "5511000000002";
		const received: SimulatorMessage[] = [];
		const unsub = subscribeToAttendant(phone, (m) => received.push(m));

		const interactive = {
			type: "button" as const,
			body: { text: "Novo caso na mesa" },
			action: { buttons: [{ type: "reply", reply: { id: "mesa_claim:abc", title: "Vou atender" } }] },
		};
		publishToAttendant(phone, "Novo caso na mesa", { interactive });

		expect(received).toHaveLength(1);
		expect(received[0].interactive).toEqual(interactive);

		unsub();
	});
});
