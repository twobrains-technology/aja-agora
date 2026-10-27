// O QUE ESTE TESTE MORDE: que a observabilidade seja LIGÁVEL e DESLIGÁVEL, e que
// desligada signifique zero efeito (nenhuma extensão no turno).
//
// O caso central é o do aceite: "sem as envs, nenhum efeito". Se alguém trocar o
// interruptor por uma flag solta, ou deixar passar "duas chaves das três", é aqui
// que estoura — antes de o vendedor gastar um turno montando span que nunca sai.

import { afterEach, describe, expect, it } from "vitest";

import {
	type Ambiente,
	caminhoDoPluginDoLangfuse,
	comIdentidadeDoTurno,
	configDoLangfuse,
	ehIdDeSessaoValido,
	langfuseLigado,
	MAX_CHARS_PADRAO,
	userIdDoTurno,
} from "./langfuse";

const LIGADO = {
	LANGFUSE_TRACING_ENABLED: "true",
	LANGFUSE_BASE_URL: "https://langfuse.example.com",
	LANGFUSE_PUBLIC_KEY: "pk-lf-abc",
	LANGFUSE_SECRET_KEY: "sk-lf-def",
} as const;

describe("configDoLangfuse — o interruptor é a flag MAIS as três chaves", () => {
	it("sem nada no ambiente, desligado", () => {
		expect(configDoLangfuse({})).toBeNull();
		expect(langfuseLigado({})).toBe(false);
	});

	// ESTE é o caso que morde o "desligado por padrão": se alguém voltar a ligar a
	// observabilidade só porque as chaves estão no ambiente, este teste cai. Foi o
	// furo que o verificador achou na primeira versão do teste — a constante
	// `LIGADO` já trazia a flag, e sem esta linha ninguém provava o contrário.
	it("com as TRÊS chaves e SEM a flag, continua DESLIGADO", () => {
		const semFlag: Ambiente = { ...LIGADO };
		delete semFlag.LANGFUSE_TRACING_ENABLED;
		expect(configDoLangfuse(semFlag)).toBeNull();
		expect(langfuseLigado(semFlag)).toBe(false);
		expect(caminhoDoPluginDoLangfuse(semFlag)).toBeNull();
	});

	it("com duas das três chaves, desligado (não existe meio-ligado)", () => {
		expect(
			configDoLangfuse({ ...LIGADO, LANGFUSE_BASE_URL: undefined, LANGFUSE_SECRET_KEY: undefined }),
		).toBeNull();
		expect(
			configDoLangfuse({
				...LIGADO,
				LANGFUSE_PUBLIC_KEY: undefined,
				LANGFUSE_SECRET_KEY: undefined,
			}),
		).toBeNull();
	});

	it("chave em branco não conta como chave", () => {
		expect(configDoLangfuse({ ...LIGADO, LANGFUSE_SECRET_KEY: "   " })).toBeNull();
	});

	it("com a flag e as três, ligado — e devolve o que o plugin precisa", () => {
		expect(configDoLangfuse({ ...LIGADO, LANGFUSE_TRACING_ENVIRONMENT: "dev" })).toEqual({
			baseUrl: "https://langfuse.example.com",
			publicKey: "pk-lf-abc",
			secretKey: "sk-lf-def",
			environment: "dev",
		});
	});

	it("a flag aceita true/1/yes/on em qualquer caixa ou com espaço", () => {
		for (const liga of ["true", "TRUE", "1", "yes", "on", " true "]) {
			expect(langfuseLigado({ ...LIGADO, LANGFUSE_TRACING_ENABLED: liga })).toBe(true);
		}
	});

	it("e recusa false/0/no/off/vazio — mesmo com as três chaves postas", () => {
		for (const desliga of ["false", "FALSE", "0", "no", "off", "", "   "]) {
			expect(configDoLangfuse({ ...LIGADO, LANGFUSE_TRACING_ENABLED: desliga })).toBeNull();
		}
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

describe("userIdDoTurno — a regra de identidade do origin/main", () => {
	const CONVERSA = "4a1af177-0a58-4dc4-9d0f-2e5f0f0f6b21";

	it("web: o cookie AJA_UID é a identidade", () => {
		expect(userIdDoTurno({ userKey: "a1b2c3d4e5", waId: null, conversaId: CONVERSA })).toBe(
			"a1b2c3d4e5",
		);
	});

	it("WhatsApp: o telefone vira `wa:<numero>`", () => {
		expect(userIdDoTurno({ userKey: null, waId: "5511999998888", conversaId: CONVERSA })).toBe(
			"wa:5511999998888",
		);
	});

	it("se o telefone já veio com o prefixo, não duplica", () => {
		expect(userIdDoTurno({ userKey: null, waId: "wa:5511999998888", conversaId: CONVERSA })).toBe(
			"wa:5511999998888",
		);
	});

	it("sem chave e sem telefone, cai no conversationId (como a main fazia)", () => {
		expect(userIdDoTurno({ userKey: null, waId: null, conversaId: CONVERSA })).toBe(CONVERSA);
		expect(userIdDoTurno({ userKey: "   ", waId: "", conversaId: CONVERSA })).toBe(CONVERSA);
	});
});

describe("comIdentidadeDoTurno — a env vale durante a carga e não vaza depois", () => {
	afterEach(() => {
		delete process.env.LANGFUSE_USER_ID;
	});

	it("põe a identidade enquanto a função roda e devolve o ambiente como estava", async () => {
		let vistoDentro: string | undefined;
		const r = await comIdentidadeDoTurno("wa:5511988887777", async () => {
			vistoDentro = process.env.LANGFUSE_USER_ID;
			return "ok";
		});
		expect(vistoDentro).toBe("wa:5511988887777");
		expect(r).toBe("ok");
		expect(process.env.LANGFUSE_USER_ID).toBeUndefined();
	});

	it("sem identidade, não entra na fila e não escreve nada", async () => {
		let vistoDentro: string | undefined = "ainda-nao-rodou";
		await comIdentidadeDoTurno(null, async () => {
			vistoDentro = process.env.LANGFUSE_USER_ID;
		});
		expect(vistoDentro).toBeUndefined();
	});

	it("duas conversas simultâneas NÃO se contaminam (é o teste que morde da corrida)", async () => {
		// Sem a fila, um dos dois leria a identidade do outro: o "põe" de B
		// sobrescreve o de A antes de A terminar de carregar a extensão.
		const lidos: string[] = [];
		await Promise.all([
			comIdentidadeDoTurno("pessoa-A", async () => {
				await new Promise((r) => setTimeout(r, 30));
				lidos.push(`A=${process.env.LANGFUSE_USER_ID}`);
			}),
			comIdentidadeDoTurno("pessoa-B", async () => {
				await new Promise((r) => setTimeout(r, 5));
				lidos.push(`B=${process.env.LANGFUSE_USER_ID}`);
			}),
		]);
		expect(lidos.sort()).toEqual(["A=pessoa-A", "B=pessoa-B"]);
		expect(process.env.LANGFUSE_USER_ID).toBeUndefined();
	});

	it("valor do operador no ambiente é restaurado, não apagado", async () => {
		process.env.LANGFUSE_USER_ID = "do-operador";
		await comIdentidadeDoTurno("da-conversa", async () => {});
		expect(process.env.LANGFUSE_USER_ID).toBe("do-operador");
	});
});
