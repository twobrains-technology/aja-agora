import { describe, expect, it } from "vitest";
import { personaExampleSchema } from "./persona";

// Garante que exemplos legados (apenas id+user+assistant) continuam válidos e
// que os novos campos opcionais aceitam as combinações esperadas.

const base = {
	id: "ex-1",
	userMessage: "O que é cota?",
	assistantResponse: "Cota é seu lugar reservado no grupo — cada pessoa tem uma.",
};

describe("personaExampleSchema — backwards compat", () => {
	it("aceita exemplo legado sem campos novos (forma mínima)", () => {
		const parsed = personaExampleSchema.safeParse(base);
		expect(parsed.success).toBe(true);
	});

	it("aceita exemplo desativado", () => {
		const parsed = personaExampleSchema.safeParse({ ...base, enabled: false });
		expect(parsed.success).toBe(true);
	});

	it("aceita origin=diagnosis com sourceConversationId UUID", () => {
		const parsed = personaExampleSchema.safeParse({
			...base,
			origin: "diagnosis",
			sourceConversationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
		});
		expect(parsed.success).toBe(true);
	});

	it("rejeita sourceConversationId que não é UUID", () => {
		const parsed = personaExampleSchema.safeParse({
			...base,
			origin: "diagnosis",
			sourceConversationId: "not-a-uuid",
		});
		expect(parsed.success).toBe(false);
	});
});

describe("personaExampleSchema — condições when*", () => {
	it("aceita whenExpertise como array de níveis válidos", () => {
		const parsed = personaExampleSchema.safeParse({
			...base,
			whenExpertise: ["leigo", "neutro"],
		});
		expect(parsed.success).toBe(true);
	});

	it("rejeita whenExpertise vazio (array.min(1)) — vazio causaria ambiguidade vs ausente", () => {
		const parsed = personaExampleSchema.safeParse({ ...base, whenExpertise: [] });
		expect(parsed.success).toBe(false);
	});

	it("rejeita valor fora do enum em whenCategory", () => {
		const parsed = personaExampleSchema.safeParse({
			...base,
			whenCategory: ["imovel", "categoria_invalida" as never],
		});
		expect(parsed.success).toBe(false);
	});

	it("aceita whenChannel singular (não é array)", () => {
		const parsed = personaExampleSchema.safeParse({ ...base, whenChannel: "whatsapp" });
		expect(parsed.success).toBe(true);
	});

	it("aceita whenIntent com todos os 6 valores", () => {
		const parsed = personaExampleSchema.safeParse({
			...base,
			whenIntent: [
				"ready_to_proceed",
				"asking_question",
				"providing_info",
				"expressing_doubt",
				"off_topic",
				"neutral",
			],
		});
		expect(parsed.success).toBe(true);
	});

	it("aceita combinação de várias condições + tags", () => {
		const parsed = personaExampleSchema.safeParse({
			...base,
			whenExpertise: ["leigo"],
			whenCategory: ["imovel"],
			whenChannel: "whatsapp",
			whenIntent: ["asking_question"],
			tags: ["jargão", "cota"],
			enabled: true,
			origin: "diagnosis",
			sourceConversationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
		});
		expect(parsed.success).toBe(true);
	});
});

describe("personaExampleSchema — limites de tags", () => {
	it("rejeita tag vazia", () => {
		const parsed = personaExampleSchema.safeParse({ ...base, tags: [""] });
		expect(parsed.success).toBe(false);
	});

	it("rejeita mais de 10 tags", () => {
		const parsed = personaExampleSchema.safeParse({
			...base,
			tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
		});
		expect(parsed.success).toBe(false);
	});
});
