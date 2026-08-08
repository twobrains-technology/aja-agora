// maskSecrets — máscara aplicada a TODO atributo exportado pro Langfuse.
// Contrato do pedido: SEGREDOS nunca vão pro trace; dado de NEGÓCIO pode ir
// (instância self-hosted nossa) — contraste proposital com o maskPii dos logs.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maskSecrets } from "./mask";

let saved: Record<string, string | undefined>;
const ENV_KEYS = ["ANTHROPIC_API_KEY", "LITELLM_API_KEY", "BEVI_API_TOKEN"] as const;

beforeEach(() => {
	saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
	for (const k of ENV_KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe("maskSecrets", () => {
	it("mascara o VALOR literal de env sensível presente no payload", () => {
		process.env.BEVI_API_TOKEN = "tok-super-secreto-123";
		const out = maskSecrets({ data: 'chamando Bevi com token "tok-super-secreto-123"' });
		expect(out).not.toContain("tok-super-secreto-123");
		expect(out).toContain("[REDACTED]");
	});

	it("mascara chaves por formato mesmo sem env correspondente (sk-ant, sk-lf, Bearer)", () => {
		const out = maskSecrets({
			data: "x sk-ant-api03-abc123XYZ y sk-lf-11112222 z Authorization: Bearer eyJhbGciOi.abc",
		});
		expect(out).not.toContain("sk-ant-api03-abc123XYZ");
		expect(out).not.toContain("sk-lf-11112222");
		expect(out).not.toMatch(/Bearer\s+eyJ/);
	});

	it("NÃO mascara dado de negócio (CPF, telefone, valores)", () => {
		const data = "cliente CPF 529.982.247-25, celular 5562999998888, carta de R$ 80.000";
		expect(maskSecrets({ data })).toBe(data);
	});

	it("não quebra com payload vazio", () => {
		expect(maskSecrets({ data: "" })).toBe("");
	});

	it("ignora env sensível VAZIA (não mascara o mundo inteiro)", () => {
		process.env.LITELLM_API_KEY = "";
		const data = "texto normal sem segredo";
		expect(maskSecrets({ data })).toBe(data);
	});
});
