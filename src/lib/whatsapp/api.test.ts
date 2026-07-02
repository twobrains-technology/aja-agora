/**
 * Garante que a camada de saída do canal WhatsApp NÃO bate na Meta Graph API
 * quando o destinatário é um waId simulado (SIM-<uuid>). Se isso vazar, o
 * simulador estaria mandando mensagens reais pelo número WhatsApp Business —
 * incidente caro e visível ao cliente.
 *
 * Estratégia: mockamos `global.fetch` e contamos chamadas. Em paralelo,
 * subscrevemos no bus pra ver que a mensagem foi de fato roteada pra lá.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	sendInteractiveMessage,
	sendListMessage,
	sendReplyButtons,
	sendTemplate,
	sendTextMessage,
	sendTypingIndicator,
} from "./api";
import { type SimulatorClientEvent, subscribeToClient } from "./simulator-bus";

const originalFetch = global.fetch;

beforeEach(() => {
	// Env vars necessárias pra getConfig() não estourar caso o branch errado caia em callApi.
	process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
	process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
	global.fetch = vi.fn(async () => {
		throw new Error("FETCH foi chamado em sendXxx com waId simulado — vazou pra Meta API!");
	}) as unknown as typeof global.fetch;
});

afterEach(() => {
	global.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe("api.ts — branch isSimulatedWaId NÃO chama Meta", () => {
	it("sendTextMessage publica no bus e retorna ack sintético", async () => {
		const waId = `SIM-${crypto.randomUUID()}`;
		const events: SimulatorClientEvent[] = [];
		const unsub = subscribeToClient(waId, (e) => events.push(e));

		const res = await sendTextMessage(waId, "olá mundo");

		expect(global.fetch).not.toHaveBeenCalled();
		expect(res.messageId).toMatch(/^sim-/);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("text");
		if (events[0].type === "text") expect(events[0].text).toBe("olá mundo");

		unsub();
	});

	it("sendReplyButtons publica interactive button no bus, não bate Meta", async () => {
		const waId = `SIM-${crypto.randomUUID()}`;
		const events: SimulatorClientEvent[] = [];
		const unsub = subscribeToClient(waId, (e) => events.push(e));

		await sendReplyButtons(waId, "Escolha:", [
			{ id: "a", title: "A" },
			{ id: "b", title: "B" },
		]);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("interactive");
		if (events[0].type === "interactive") {
			const inter = events[0].interactive as {
				type: string;
				action: { buttons: Array<{ reply: { id: string } }> };
			};
			expect(inter.type).toBe("button");
			expect(inter.action.buttons).toHaveLength(2);
			expect(inter.action.buttons[0].reply.id).toBe("a");
		}

		unsub();
	});

	it("sendListMessage publica interactive list no bus, não bate Meta", async () => {
		const waId = `SIM-${crypto.randomUUID()}`;
		const events: SimulatorClientEvent[] = [];
		const unsub = subscribeToClient(waId, (e) => events.push(e));

		await sendListMessage(waId, "?", "Ver", [
			{ title: "Sec", rows: [{ id: "r1", title: "Linha 1" }] },
		]);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("interactive");
		if (events[0].type === "interactive") {
			const inter = events[0].interactive as { type: string };
			expect(inter.type).toBe("list");
		}

		unsub();
	});

	it("sendInteractiveMessage publica payload arbitrário no bus, não bate Meta", async () => {
		const waId = `SIM-${crypto.randomUUID()}`;
		const events: SimulatorClientEvent[] = [];
		const unsub = subscribeToClient(waId, (e) => events.push(e));

		await sendInteractiveMessage(waId, { type: "button", body: { text: "x" }, action: {} });

		expect(global.fetch).not.toHaveBeenCalled();
		expect(events).toHaveLength(1);

		unsub();
	});

	it("sendTypingIndicator com messageId sintético (sim-*) é no-op", async () => {
		const res = await sendTypingIndicator(`sim-${crypto.randomUUID()}`);
		expect(global.fetch).not.toHaveBeenCalled();
		expect(res.messageId).toMatch(/^sim-/);
	});

	it("sendTemplate pra waId simulado NÃO bate Meta (retorna ack sintético)", async () => {
		const waId = `SIM-${crypto.randomUUID()}`;
		const res = await sendTemplate(waId, "aja_reabrir_conversa", "pt_BR");
		expect(global.fetch).not.toHaveBeenCalled();
		expect(res.messageId).toMatch(/^sim-/);
	});
});

describe("api.ts — número real continua chamando Meta", () => {
	it("sendTextMessage pra número real chama fetch da Meta Graph", async () => {
		// Substituímos o mock pra que callApi consiga seguir
		global.fetch = vi.fn(async () => {
			return new Response(JSON.stringify({ messages: [{ id: "wamid.real-123" }] }), {
				status: 200,
			});
		}) as unknown as typeof global.fetch;

		const res = await sendTextMessage("5511999990000", "msg real");

		expect(global.fetch).toHaveBeenCalledTimes(1);
		const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(url).toContain("graph.facebook.com");
		expect((init.headers as Record<string, string>).Authorization).toContain("test-token");
		expect(res.messageId).toBe("wamid.real-123");
	});

	// REGRESSÃO (bloco-rev-d): sendTemplate tinha `return simulatedAck()` no TOPO
	// da função (código morto depois). Resultado: o template HSM — único jeito de
	// reabrir a janela de 24h quando ela fecha (admin/conversations/[id]/message) —
	// NUNCA chegava à Meta em produção; o atendente recebia um ack `sim-*` falso e
	// o cliente não recebia nada.
	it("sendTemplate pra número real chama fetch da Meta com payload de template", async () => {
		global.fetch = vi.fn(async () => {
			return new Response(JSON.stringify({ messages: [{ id: "wamid.tmpl-1" }] }), {
				status: 200,
			});
		}) as unknown as typeof global.fetch;

		const res = await sendTemplate("5511999990000", "aja_reabrir_conversa", "pt_BR");

		expect(global.fetch).toHaveBeenCalledTimes(1);
		const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(url).toContain("graph.facebook.com");
		const body = JSON.parse(init.body as string);
		expect(body.messaging_product).toBe("whatsapp");
		expect(body.to).toBe("5511999990000");
		expect(body.type).toBe("template");
		expect(body.template.name).toBe("aja_reabrir_conversa");
		expect(body.template.language.code).toBe("pt_BR");
		expect(res.messageId).toBe("wamid.tmpl-1");
	});
});
