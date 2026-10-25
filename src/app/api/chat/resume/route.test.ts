// GET /api/chat/resume — a retomada same-device (FIX-46) entrega o payload do
// `getResumableConversation` sem mexer nele, com as partes na ordem persistida
// (é delas que o teatro reconstrói texto → card → texto) e sem cache.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getResumableConversation } = vi.hoisted(() => ({ getResumableConversation: vi.fn() }));

vi.mock("@/lib/chat/resume", () => ({ getResumableConversation }));

import { GET } from "./route";

const retomada = {
	conversationId: "conv-1",
	messages: [
		{ id: "m1", role: "user" as const, parts: [{ type: "text" as const, text: "oi" }] },
		{
			id: "m2",
			role: "assistant" as const,
			parts: [
				{ type: "text" as const, text: "some" },
				{ type: "artifact" as const, artifactType: "comparison_table", payload: { carta: "ITAÚ" } },
				{ type: "text" as const, text: "e então?" },
			],
		},
	],
	messageCount: 2,
	gate: null,
	lastActivityAt: "2026-10-20T12:00:00.000Z",
	meaningfulProgress: true,
};

function request(cookie?: string): Request {
	return new Request("http://localhost/api/chat/resume", {
		headers: cookie ? { cookie } : {},
	});
}

beforeEach(() => {
	getResumableConversation.mockReset();
});

describe("GET /api/chat/resume", () => {
	it("entrega as partes do turno na ordem persistida (texto, card, texto)", async () => {
		getResumableConversation.mockResolvedValue(retomada);

		const res = await GET(request("aja_uid=abc123"));
		const body = (await res.json()) as { conversation: typeof retomada };

		expect(getResumableConversation).toHaveBeenCalledWith("abc123");
		expect(
			body.conversation.messages[1].parts.map((p) => (p.type === "text" ? "text" : "artifact")),
		).toEqual(["text", "artifact", "text"]);
	});

	it("sem cookie → primeira vez (conversation null), e a resposta não é cacheada", async () => {
		getResumableConversation.mockResolvedValue(null);

		const res = await GET(request());

		expect(getResumableConversation).toHaveBeenCalledWith(null);
		expect(await res.json()).toEqual({ conversation: null });
		expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
	});
});
