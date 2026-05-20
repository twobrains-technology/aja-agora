import { describe, expect, it } from "vitest";
import { personaPatchSchema } from "./persona-patch";

describe("personaPatchSchema", () => {
	it("aceita voiceTone patch válido", () => {
		const result = personaPatchSchema.safeParse({
			kind: "voiceTone",
			before: "formal e técnico",
			after: "casual, próximo, como amigo no zap",
			rationale: "admin pediu menos formal",
			personaVersionSeen: 3,
		});
		expect(result.success).toBe(true);
	});

	it("rejeita voiceTone com after > 2000 chars", () => {
		const result = personaPatchSchema.safeParse({
			kind: "voiceTone",
			before: "x",
			after: "y".repeat(2001),
			rationale: "r",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(false);
	});

	it("aceita example.add com PersonaExample válido", () => {
		const result = personaPatchSchema.safeParse({
			kind: "example.add",
			after: {
				id: "ex-001",
				userMessage: "Quanto custa?",
				assistantResponse: "Depende da faixa. Posso te mostrar opções?",
			},
			rationale: "exemplo de pergunta de preço",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(true);
	});

	it("rejeita example.add com userMessage muito curto", () => {
		const result = personaPatchSchema.safeParse({
			kind: "example.add",
			after: {
				id: "ex-002",
				userMessage: "ok",
				assistantResponse: "Beleza! Vamos lá?",
			},
			rationale: "r",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(false);
	});

	it("aceita example.remove com targetId uuid", () => {
		const result = personaPatchSchema.safeParse({
			kind: "example.remove",
			targetId: "550e8400-e29b-41d4-a716-446655440000",
			rationale: "exemplo redundante",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(true);
	});

	it("aceita example.remove com targetId slug (moto-b11-primeira-vez)", () => {
		// IDs reais no DB são slugs kebab-case, não UUIDs. Aceitar qualquer
		// string não-vazia.
		const result = personaPatchSchema.safeParse({
			kind: "example.remove",
			targetId: "moto-b11-primeira-vez",
			rationale: "r",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(true);
	});

	it("rejeita example.remove com targetId vazio", () => {
		const result = personaPatchSchema.safeParse({
			kind: "example.remove",
			targetId: "",
			rationale: "r",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(false);
	});

	it("aceita forbiddenTopic.add", () => {
		const result = personaPatchSchema.safeParse({
			kind: "forbiddenTopic.add",
			after: {
				id: "ft-001",
				topic: "comissão de corretor",
				responseWhenAsked:
					"Não trabalho com corretagem. Sou seu agente digital direto.",
				enabled: true,
			},
			rationale: "evitar pergunta de comissão",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(true);
	});

	it("aceita forbiddenTopic.remove", () => {
		const result = personaPatchSchema.safeParse({
			kind: "forbiddenTopic.remove",
			targetId: "550e8400-e29b-41d4-a716-446655440000",
			rationale: "tópico não faz sentido",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(true);
	});

	it("aceita handoffTrigger.add", () => {
		const result = personaPatchSchema.safeParse({
			kind: "handoffTrigger.add",
			after: {
				id: "ht-001",
				condition: "usuário pede explicitamente falar com humano",
				enabled: true,
			},
			rationale: "trigger explícito de humano",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(true);
	});

	it("aceita handoffTrigger.remove", () => {
		const result = personaPatchSchema.safeParse({
			kind: "handoffTrigger.remove",
			targetId: "550e8400-e29b-41d4-a716-446655440000",
			rationale: "trigger redundante",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(true);
	});

	it("rejeita kind desconhecido", () => {
		const result = personaPatchSchema.safeParse({
			kind: "displayName",
			after: "Novo Nome",
			rationale: "r",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(false);
	});

	it("rejeita patch sem personaVersionSeen", () => {
		const result = personaPatchSchema.safeParse({
			kind: "voiceTone",
			before: "x",
			after: "y",
			rationale: "r",
		});
		expect(result.success).toBe(false);
	});

	it("rejeita rationale vazio", () => {
		const result = personaPatchSchema.safeParse({
			kind: "voiceTone",
			before: "x",
			after: "y",
			rationale: "",
			personaVersionSeen: 1,
		});
		expect(result.success).toBe(false);
	});

	it("rejeita personaVersionSeen negativo", () => {
		const result = personaPatchSchema.safeParse({
			kind: "voiceTone",
			before: "x",
			after: "y",
			rationale: "r",
			personaVersionSeen: -1,
		});
		expect(result.success).toBe(false);
	});
});
