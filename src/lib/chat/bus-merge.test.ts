// FIX-31 (bloco-q) — invariante de dedupe do provider extraído pra função pura
// testável. A bolha do usuário duplicava porque o id do eco ≠ id otimista; com
// o id preservado (ver route.handoff-echo.test.ts), este merge passa a casar.
import { describe, expect, it } from "vitest";
import { appendBusMessage } from "./bus-merge";
import type { AjaUIMessage } from "./ui-message";

function userMsg(id: string, text: string): AjaUIMessage {
	return { id, role: "user", parts: [{ type: "text", text }] } as AjaUIMessage;
}

describe("FIX-31 — appendBusMessage dedupe por id", () => {
	it("não duplica quando o id já está presente (eco com id preservado)", () => {
		const prev = [userMsg("abc", "preciso mudar o valor")];
		const incoming = userMsg("abc", "preciso mudar o valor");
		const next = appendBusMessage(prev, incoming);
		expect(next).toBe(prev); // mesma referência: nada appendado
		expect(next).toHaveLength(1);
	});

	it("appenda quando o id é novo (mensagem de outra aba ou do consultor)", () => {
		const prev = [userMsg("abc", "oi")];
		const incoming = {
			id: "def",
			role: "assistant",
			parts: [{ type: "text", text: "resposta" }],
		} as AjaUIMessage;
		const next = appendBusMessage(prev, incoming);
		expect(next).toHaveLength(2);
		expect(next[1].id).toBe("def");
	});
});
