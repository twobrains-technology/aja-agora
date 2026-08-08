// syncPrompt — bootstrap idempotente: registra o texto do código como versão
// `production` SÓ quando mudou. Rodar 2x não cria versão nova (senão cada
// deploy sujaria o histórico de versões e as métricas por versão).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncPrompt } from "./sync-prompts";

const promptGet = vi.fn();
const promptCreate = vi.fn(async () => ({}));
// biome-ignore lint/suspicious/noExplicitAny: client fake de teste
const client = { prompt: { get: promptGet, create: promptCreate } } as any;

beforeEach(() => {
	promptGet.mockReset();
	promptCreate.mockClear();
});

describe("syncPrompt", () => {
	it("prompt inexistente ⇒ cria a versão inicial com label production", async () => {
		promptGet.mockRejectedValue(new Error("404 prompt not found"));
		const result = await syncPrompt(client, "aja-system-prompt", "texto do código");
		expect(result).toBe("created");
		expect(promptCreate).toHaveBeenCalledWith({
			name: "aja-system-prompt",
			type: "text",
			prompt: "texto do código",
			labels: ["production"],
		});
	});

	it("versão production IDÊNTICA ⇒ unchanged, não cria nada", async () => {
		promptGet.mockResolvedValue({ prompt: "texto do código", isFallback: false });
		const result = await syncPrompt(client, "aja-system-prompt", "texto do código");
		expect(result).toBe("unchanged");
		expect(promptCreate).not.toHaveBeenCalled();
	});

	it("texto mudou no código ⇒ cria versão nova", async () => {
		promptGet.mockResolvedValue({ prompt: "texto antigo", isFallback: false });
		const result = await syncPrompt(client, "aja-system-prompt", "texto novo");
		expect(result).toBe("created");
		expect(promptCreate).toHaveBeenCalledTimes(1);
	});
});
