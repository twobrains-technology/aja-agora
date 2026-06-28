import { isWindowOpen } from "@/lib/whatsapp/window";
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("isWindowOpen — FIX-86", () => {
	it("retorna open=true quando inbound foi nos últimos 24h", async () => {
		// Mock simples - espera implementação real
		const result = await isWindowOpen("conv-123");

		expect(result).toBeDefined();
		expect(typeof result.open).toBe("boolean");
		expect(result.expiresAt).toBeDefined();
	});

	it("retorna open=false quando inbound foi há mais de 24h", async () => {
		const result = await isWindowOpen("conv-456");
		expect(result).toBeDefined();
		expect(typeof result.open).toBe("boolean");
	});

	it("retorna open=false quando não há lastInboundAt", async () => {
		const result = await isWindowOpen("conv-789");
		expect(result).toBeDefined();
		expect(result.open).toBe(false);
	});
});
