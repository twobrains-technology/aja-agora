// @vitest-environment happy-dom
// RETOMADA NO CLIENTE — o payload hidratado vira mensagens com as partes na
// ordem em que o servidor as devolveu (texto → card → texto), não [texto, card].
import { describe, expect, it } from "vitest";
import { toResumedMessages } from "./theater-chat";

describe("toResumedMessages", () => {
	it("remonta texto → card → texto na ordem persistida", () => {
		const mensagens = toResumedMessages({
			conversationId: "conv-1",
			messageCount: 2,
			lastActivityAt: "2026-10-20T12:00:00.000Z",
			meaningfulProgress: true,
			messages: [
				{
					id: "m1",
					role: "user",
					parts: [{ type: "text", text: "Quero um carro de uns 80 mil." }],
				},
				{
					id: "m2",
					role: "assistant",
					parts: [
						{ type: "text", text: "Achei estas opções pra você:" },
						{ type: "artifact", artifactType: "comparison_table", payload: { carta: "ITAÚ" } },
						{ type: "text", text: "Qual delas te agrada mais?" },
					],
				},
			],
		});

		expect(mensagens.map((m) => m.role)).toEqual(["user", "assistant"]);
		expect(mensagens[1].parts).toEqual([
			{ type: "text", text: "Achei estas opções pra você:" },
			{
				type: "data-artifact",
				id: "m2-1",
				data: { type: "comparison_table", payload: { carta: "ITAÚ" } },
			},
			{ type: "text", text: "Qual delas te agrada mais?" },
		]);
	});

	it("todo histórico hidratado vem marcado como retomada (FIX-49)", () => {
		const mensagens = toResumedMessages({
			conversationId: "conv-1",
			messageCount: 1,
			lastActivityAt: "2026-10-20T12:00:00.000Z",
			meaningfulProgress: false,
			messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "oi" }] }],
		});

		expect(mensagens[0].metadata).toEqual({ resumed: true });
	});
});
