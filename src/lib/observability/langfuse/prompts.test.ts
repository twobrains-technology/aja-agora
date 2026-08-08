// fetchManagedPrompt — a rede de segurança do Prompt Management: o texto do
// CÓDIGO é o fallback SEMPRE (Langfuse fora do ar nunca derruba o app), e a
// versão do Langfuse só é linkada na generation quando veio de verdade de lá
// (fallback não tem versão — linkar mentiria a métrica por versão).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	promptGet: vi.fn(),
	getLangfuseClient: vi.fn((): unknown => ({ prompt: { get: mocks.promptGet } })),
}));

vi.mock("./client", () => ({ getLangfuseClient: mocks.getLangfuseClient }));

import { fetchManagedPrompt, PROMPT_NAMES } from "./prompts";

const FALLBACK = "prompt embutido no código";

beforeEach(() => {
	mocks.promptGet.mockReset();
	mocks.getLangfuseClient.mockReset();
	mocks.getLangfuseClient.mockReturnValue({ prompt: { get: mocks.promptGet } });
});

describe("fetchManagedPrompt", () => {
	it("client nulo (desligado) ⇒ fallback do código, sem rede, lfPrompt null", async () => {
		mocks.getLangfuseClient.mockReturnValue(null);
		const out = await fetchManagedPrompt(PROMPT_NAMES.system, FALLBACK);
		expect(out).toEqual({ text: FALLBACK, lfPrompt: null });
		expect(mocks.promptGet).not.toHaveBeenCalled();
	});

	it("prompt do Langfuse ⇒ usa o texto gerenciado e expõe o client pro link de versão", async () => {
		const managed = { prompt: "texto vindo do Langfuse", isFallback: false };
		mocks.promptGet.mockResolvedValue(managed);
		const out = await fetchManagedPrompt(PROMPT_NAMES.system, FALLBACK);
		expect(out.text).toBe("texto vindo do Langfuse");
		expect(out.lfPrompt).toBe(managed);
		expect(mocks.promptGet).toHaveBeenCalledWith(
			PROMPT_NAMES.system,
			expect.objectContaining({
				label: "production",
				cacheTtlSeconds: 60,
				fallback: FALLBACK,
				type: "text",
			}),
		);
	});

	it("SDK devolveu o próprio fallback (Langfuse fora) ⇒ texto ok, mas SEM link de versão", async () => {
		mocks.promptGet.mockResolvedValue({ prompt: FALLBACK, isFallback: true });
		const out = await fetchManagedPrompt(PROMPT_NAMES.system, FALLBACK);
		expect(out.text).toBe(FALLBACK);
		expect(out.lfPrompt).toBeNull();
	});

	it("prompt.get lançando ⇒ fallback do código, nunca propaga", async () => {
		mocks.promptGet.mockRejectedValue(new Error("langfuse fora do ar"));
		const out = await fetchManagedPrompt(PROMPT_NAMES.system, FALLBACK);
		expect(out).toEqual({ text: FALLBACK, lfPrompt: null });
	});
});
