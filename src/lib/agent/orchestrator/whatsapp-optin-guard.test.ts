import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";

describe("shouldEmitWhatsappOptin — PF-07 guard de duplicação", () => {
	it("emite quando meta.whatsappOptinShown não está setado", () => {
		const meta: ConversationMetadata = {};
		expect(shouldEmitWhatsappOptin(meta)).toBe(true);
	});

	it("emite quando meta.whatsappOptinShown é false", () => {
		const meta: ConversationMetadata = { whatsappOptinShown: false };
		expect(shouldEmitWhatsappOptin(meta)).toBe(true);
	});

	it("NÃO emite quando meta.whatsappOptinShown é true", () => {
		const meta: ConversationMetadata = { whatsappOptinShown: true };
		expect(shouldEmitWhatsappOptin(meta)).toBe(false);
	});

	it("NÃO emite mesmo se user já recusou (declined → shown=true)", () => {
		const meta: ConversationMetadata = {
			whatsappOptinShown: true,
			whatsappOptinDeclined: true,
		};
		expect(shouldEmitWhatsappOptin(meta)).toBe(false);
	});
});
