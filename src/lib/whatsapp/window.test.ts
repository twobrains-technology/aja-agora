import { describe, expect, it } from "vitest";
import { isWindowOpen, isWindowOpenFast, WINDOW_MS } from "@/lib/whatsapp/window";

const HORA = 60 * 60 * 1000;

// FIX-86 — janela de 24h da WhatsApp Cloud API. A lógica pura (isWindowOpenFast)
// é testada de forma determinística; o caminho de DB (isWindowOpen) é coberto pelo
// caso de conversa inexistente (janela fechada sem inbound).
describe("isWindowOpenFast — lógica da janela 24h (pura)", () => {
	it("aberta quando o inbound foi nos últimos 24h", () => {
		expect(isWindowOpenFast(new Date(Date.now() - 1 * HORA))).toBe(true);
		expect(isWindowOpenFast(new Date(Date.now() - 23 * HORA))).toBe(true);
	});

	it("fechada quando o inbound foi há mais de 24h", () => {
		expect(isWindowOpenFast(new Date(Date.now() - 25 * HORA))).toBe(false);
	});

	it("fechada quando não há inbound (null)", () => {
		expect(isWindowOpenFast(null)).toBe(false);
	});

	it("aceita string ISO e rejeita data inválida", () => {
		expect(isWindowOpenFast(new Date(Date.now() - HORA).toISOString())).toBe(true);
		expect(isWindowOpenFast("não-é-data")).toBe(false);
	});

	it("WINDOW_MS é 24h", () => {
		expect(WINDOW_MS).toBe(24 * HORA);
	});
});

describe("isWindowOpen — consulta o lastInboundAt no DB (FIX-86)", () => {
	it("conversa inexistente → janela fechada (open=false, expiresAt=null)", async () => {
		const r = await isWindowOpen("00000000-0000-0000-0000-000000000000");
		expect(r.open).toBe(false);
		expect(r.expiresAt).toBeNull();
	});
});
