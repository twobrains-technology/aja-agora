// Bv2-08-novo (descoberto pelo QA DEV round 2): TypeError quando
// messages[].parts é undefined ou ausente. Ex: payload legacy
// { role, content } sem parts[] crashava com
// "Cannot read properties of undefined (reading 'filter')".
import { describe, expect, it } from "vitest";
import { lastUserText } from "./route";

describe("lastUserText — guardrail defensivo (Bv2-08-novo)", () => {
	it("retorna texto do parts moderno", () => {
		// biome-ignore lint/suspicious/noExplicitAny: relaxar pra fixture
		const messages: any = [{ role: "user", parts: [{ type: "text", text: "olá" }] }];
		expect(lastUserText(messages)).toBe("olá");
	});

	it("não crasha quando parts é undefined (payload legacy)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: simulate legacy payload
		const messages: any = [{ role: "user", content: "oi legacy" }];
		expect(() => lastUserText(messages)).not.toThrow();
	});

	it("fallback pra msg.content quando parts ausente", () => {
		// biome-ignore lint/suspicious/noExplicitAny: simulate legacy payload
		const messages: any = [{ role: "user", content: "oi legacy" }];
		expect(lastUserText(messages)).toBe("oi legacy");
	});

	it("não crasha quando parts é null", () => {
		// biome-ignore lint/suspicious/noExplicitAny: malformed
		const messages: any = [{ role: "user", parts: null }];
		expect(() => lastUserText(messages)).not.toThrow();
		expect(lastUserText(messages)).toBeNull();
	});

	it("não crasha quando part.type ausente", () => {
		// biome-ignore lint/suspicious/noExplicitAny: malformed
		const messages: any = [{ role: "user", parts: [{ text: "sem type" }] }];
		expect(() => lastUserText(messages)).not.toThrow();
	});

	it("retorna null pra array vazio", () => {
		expect(lastUserText([])).toBeNull();
	});

	it("retorna null pra undefined", () => {
		expect(lastUserText(undefined)).toBeNull();
	});

	it("pega a última mensagem de user (não a primeira)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: fixture
		const messages: any = [
			{ role: "user", parts: [{ type: "text", text: "primeira" }] },
			{ role: "assistant", parts: [{ type: "text", text: "resposta" }] },
			{ role: "user", parts: [{ type: "text", text: "ultima" }] },
		];
		expect(lastUserText(messages)).toBe("ultima");
	});
});
