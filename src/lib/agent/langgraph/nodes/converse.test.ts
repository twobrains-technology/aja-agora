// FIX-358 — nó `converse`: (a) NUNCA fala por texto pré-fabricado — todo
// text-delta vem do `model.stream()` (lei-mãe "não engessar"); (b) tool
// hallucination/fora do toolset what-if NUNCA derruba o turno — ToolNode
// devolve ToolMessage de erro, não lança (invariante "0 NoSuchToolError",
// crítico ALTA-2). Unitário — sem DB (nenhum tool aqui chega a executar
// contra Bevi/DB de verdade).
import { AIMessage, AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { createConverseNode } from "./converse";
import type { AgentGraphStateType } from "../state";

function fakeState(overrides?: Partial<AgentGraphStateType>): AgentGraphStateType {
	const baseMeta: ConversationMetadata = { currentPersona: "auto", currentCategory: "auto" };
	return {
		messages: [],
		conversationId: "00000000-0000-4000-8000-000000000123",
		channel: "web",
		contactName: null,
		isUserTurn: true,
		userText: "quero um carro de uns 80 mil",
		baseMeta,
		intent: undefined,
		gate: undefined,
		funnel: {
			currentPersona: "auto",
			currentCategory: "auto",
			desireAsked: true,
			qualifyAnswers: {},
			identityCollected: false,
			searchDispatched: false,
			revealCompleted: false,
			decisionDispatched: false,
		},
		events: [],
		...overrides,
	} as AgentGraphStateType;
}

function noopConfig() {
	return { writer: undefined } as never;
}

describe("FIX-358 — nó converse: NUNCA fala por texto pré-fabricado", () => {
	it("o text-delta emitido vem do model.stream() — muda com o response configurado", async () => {
		const model = new FakeStreamingChatModel({
			responses: [new AIMessage("Boa! Carro de 80 mil é uma ótima escolha.")],
			sleep: 0,
		});
		const node = createConverseNode(model);

		const result = await node(fakeState(), noopConfig());
		const textDeltas = (result.events ?? [])
			.filter((ev): ev is Extract<typeof ev, { type: "text-delta" }> => ev.type === "text-delta")
			.map((ev) => ev.text)
			.join("");

		expect(textDeltas).toContain("80 mil");
		expect(textDeltas).toContain("ótima escolha");
	});

	it("resposta DIFERENTE do model produz texto DIFERENTE — prova que não é const fixa", async () => {
		const modelA = new FakeStreamingChatModel({
			responses: [new AIMessage("Resposta A, completamente diferente.")],
			sleep: 0,
		});
		const modelB = new FakeStreamingChatModel({
			responses: [new AIMessage("Outra fala B, nada a ver com a primeira.")],
			sleep: 0,
		});

		const resultA = await createConverseNode(modelA)(fakeState(), noopConfig());
		const resultB = await createConverseNode(modelB)(fakeState(), noopConfig());

		const textOf = (r: Partial<AgentGraphStateType>) =>
			(r.events ?? [])
				.filter((ev): ev is Extract<typeof ev, { type: "text-delta" }> => ev.type === "text-delta")
				.map((ev) => ev.text)
				.join("");

		expect(textOf(resultA)).not.toBe(textOf(resultB));
	});
});

describe("FIX-358 — nó converse: 0 NoSuchToolError (tool fora do what-if toolset)", () => {
	it("tool_call hallucinado (nome fora do toolset bindado) NUNCA derruba o turno", async () => {
		// `search_groups` é o nó `discovery` (determinístico) — NUNCA entra no
		// toolset what-if bindado ao modelo. Simula o modelo "alucinando" uma
		// chamada a ele mesmo assim (script direto via `chunks`, que o fake não
		// valida contra o binding) — prova que o grafo não lança.
		const model = new FakeStreamingChatModel({
			chunks: [
				new AIMessageChunk({
					content: "",
					tool_calls: [
						{ name: "search_groups", args: { category: "auto" }, id: "call-1", type: "tool_call" },
					],
				}),
				// 2ª rodada do loop: sem mais tool_calls, fecha o turno com texto.
			],
			sleep: 0,
		});
		const node = createConverseNode(model);

		await expect(node(fakeState(), noopConfig())).resolves.not.toThrow();
		const result = await node(fakeState(), noopConfig());

		const toolMessages = result.messages?.filter((m) => m.getType() === "tool") ?? [];
		expect(toolMessages.length).toBeGreaterThan(0);
		expect(String(toolMessages[0]?.content)).toMatch(/not found/i);
	});
});

describe("FIX-358 — nó converse: acumula mensagens pro reducer de state.messages", () => {
	it("devolve o HumanMessage do turno + a resposta do modelo em `messages` (histórico anterior preservado à parte)", async () => {
		const model = new FakeStreamingChatModel({ responses: [new AIMessage("Tudo ótimo!")], sleep: 0 });
		const node = createConverseNode(model);

		const result = await node(
			fakeState({ messages: [new HumanMessage("oi"), new AIMessage("Oi! Tudo bem?")] }),
			noopConfig(),
		);

		// `newMessages` (não o histórico completo — esse é papel do reducer de
		// MessagesAnnotation, que soma por cima do `state.messages` de entrada).
		expect(result.messages).toHaveLength(2);
		expect(result.messages?.[0]?.getType()).toBe("human");
		expect(String(result.messages?.[0]?.content)).toBe("quero um carro de uns 80 mil");
		expect(result.messages?.[1]?.getType()).toBe("ai");
		expect(String(result.messages?.[1]?.content)).toBe("Tudo ótimo!");
	});
});
