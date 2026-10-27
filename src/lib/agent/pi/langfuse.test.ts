// O QUE ESTE TESTE MORDE: que a observabilidade seja LIGÁVEL e DESLIGÁVEL, e que
// desligada signifique zero efeito (nenhuma extensão no turno).
//
// O caso central é o do aceite: "sem as envs, nenhum efeito". Se alguém trocar o
// interruptor por uma flag solta, ou deixar passar "duas chaves das três", é aqui
// que estoura — antes de o vendedor gastar um turno montando span que nunca sai.

import { describe, expect, it } from "vitest";

import {
	type Ambiente,
	caminhoDoPluginDoLangfuse,
	configDoLangfuse,
	ehIdDeSessaoValido,
	langfuseLigado,
	MAX_CHARS_PADRAO,
} from "./langfuse";

const LIGADO = {
	LANGFUSE_BASE_URL: "https://langfuse.example.com",
	LANGFUSE_PUBLIC_KEY: "pk-lf-abc",
	LANGFUSE_SECRET_KEY: "sk-lf-def",
} as const;

describe("configDoLangfuse — o interruptor é ter as três chaves", () => {
	it("sem nada no ambiente, desligado", () => {
		expect(configDoLangfuse({})).toBeNull();
		expect(langfuseLigado({})).toBe(false);
	});

	it("com duas das três chaves, desligado (não existe meio-ligado)", () => {
		expect(
			configDoLangfuse({ LANGFUSE_BASE_URL: "https://x", LANGFUSE_PUBLIC_KEY: "pk-lf-a" }),
		).toBeNull();
		expect(
			configDoLangfuse({ LANGFUSE_PUBLIC_KEY: "pk-lf-a", LANGFUSE_SECRET_KEY: "sk-lf-b" }),
		).toBeNull();
	});

	it("chave em branco não conta como chave", () => {
		expect(configDoLangfuse({ ...LIGADO, LANGFUSE_SECRET_KEY: "   " })).toBeNull();
	});

	it("com as três, ligado — e devolve o que o plugin precisa", () => {
		expect(configDoLangfuse({ ...LIGADO, LANGFUSE_TRACING_ENVIRONMENT: "dev" })).toEqual({
			baseUrl: "https://langfuse.example.com",
			publicKey: "pk-lf-abc",
			secretKey: "sk-lf-def",
			environment: "dev",
		});
	});

	it("LANGFUSE_TRACING_ENABLED=false desliga mesmo com as três (é o kill switch do plugin)", () => {
		expect(configDoLangfuse({ ...LIGADO, LANGFUSE_TRACING_ENABLED: "false" })).toBeNull();
		expect(configDoLangfuse({ ...LIGADO, LANGFUSE_TRACING_ENABLED: " FALSE " })).toBeNull();
	});

	it('um valor qualquer em LANGFUSE_TRACING_ENABLED NÃO desliga (o plugin só lê "false")', () => {
		expect(langfuseLigado({ ...LIGADO, LANGFUSE_TRACING_ENABLED: "1" })).toBe(true);
	});
});

describe("ehIdDeSessaoValido — a regra do Pi, aplicada antes de ele lançar", () => {
	it("aceita uuid de conversa (o id real do banco) e slug com ponto/hífen", () => {
		expect(ehIdDeSessaoValido("4a1af177-0a58-4dc4-9d0f-2e5f0f0f6b21")).toBe(true);
		expect(ehIdDeSessaoValido("simulador.teste_3")).toBe(true);
	});

	it("recusa vazio, null, espaço, barra e o que não começa/termina alfanumérico", () => {
		for (const ruim of ["", null, undefined, "com espaço", "a/b", "-abc", "abc-"]) {
			expect(ehIdDeSessaoValido(ruim as string)).toBe(false);
		}
	});
});

describe("caminhoDoPluginDoLangfuse — desligado não resolve nada", () => {
	it("sem as chaves devolve null e nem toca no disco", () => {
		expect(caminhoDoPluginDoLangfuse({})).toBeNull();
	});

	it("ligado devolve o caminho absoluto do fonte do plugin e põe PI_LANGFUSE_MAX_CHARS", () => {
		const env: Ambiente = { ...LIGADO };
		const caminho = caminhoDoPluginDoLangfuse(env);

		expect(caminho).toBeTruthy();
		expect(caminho?.endsWith("node_modules/@langfuse/pi-observability-plugin/src/index.ts")).toBe(
			true,
		);
		// 20.709 caracteres foi o system prompt medido no spike; 40 mil cobre com folga
		expect(Number(env.PI_LANGFUSE_MAX_CHARS)).toBe(Number(MAX_CHARS_PADRAO));
		expect(Number(env.PI_LANGFUSE_MAX_CHARS)).toBeGreaterThan(20_709);
	});

	it("MAX_CHARS já definido pelo operador é respeitado, não sobrescrito", () => {
		const env: Ambiente = { ...LIGADO, PI_LANGFUSE_MAX_CHARS: "1234" };
		caminhoDoPluginDoLangfuse(env);
		expect(env.PI_LANGFUSE_MAX_CHARS).toBe("1234");
	});
});
