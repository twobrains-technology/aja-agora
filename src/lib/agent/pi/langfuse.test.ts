// O QUE ESTE TESTE MORDE: que a observabilidade seja LIGÁVEL e DESLIGÁVEL, e que
// desligada signifique zero efeito (nenhuma extensão no turno).
//
// O caso central é o do aceite: "sem as envs, nenhum efeito". Se alguém trocar o
// interruptor por uma flag solta, ou deixar passar "duas chaves das três", é aqui
// que estoura — antes de o vendedor gastar um turno montando span que nunca sai.

import { setLangfuseTracerProvider } from "@langfuse/tracing";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
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
import {
	anexarInputCompleto,
	comTeto,
	entradaCompleta,
	NOME_DA_OBSERVACAO,
	tetoDoInput,
	textoDaMensagem,
} from "./langfuse-input-completo";

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

const PAYLOAD_OPENAI = {
	model: "qwen3.6-flash",
	messages: [
		{ role: "system", content: "Você é o vendedor. PROMPT_DO_VENDEDOR base aqui." },
		{ role: "user", content: "oi" },
		{ role: "assistant", content: [{ type: "text", text: "oi, quanto quer investir?" }] },
		{ role: "user", content: "50 mil" },
	],
	tools: [{ type: "function", function: { name: "mostrar_card", parameters: { type: "object" } } }],
};

const ENVS_DO_PAI = {
	LANGFUSE_TRACING_ENABLED: "true",
	LANGFUSE_BASE_URL: "https://langfuse.example.com",
	LANGFUSE_PUBLIC_KEY: "pk-lf-abc",
	LANGFUSE_SECRET_KEY: "sk-lf-def",
	LANGFUSE_PI_PARENT_TRACE_ID: "a".repeat(32),
	LANGFUSE_PI_PARENT_SPAN_ID: "b".repeat(16),
	LANGFUSE_PI_PARENT_SESSION_ID: "4a1af177-0a58-4dc4-9d0f-2e5f0f0f6b21",
} as const;

describe("entradaCompleta — as três partes do que o modelo de fato leu", () => {
	it("separa system (da caixa), histórico e definição de tools do payload OpenAI", () => {
		const entrada = entradaCompleta(PAYLOAD_OPENAI);
		expect(entrada).not.toBeNull();
		expect(entrada?.system).toContain("PROMPT_DO_VENDEDOR");
		const historico = JSON.parse(entrada?.historico ?? "[]") as Array<{
			role: string;
			content: string;
		}>;
		// só as NÃO-system; e o content de array de parts vira o texto junto
		expect(historico).toHaveLength(3);
		expect(historico[2]).toEqual({ role: "user", content: "50 mil" });
		expect(entrada?.tools).toContain("mostrar_card");
	});

	it("payload sem messages (ou não-objeto) não anexa nada — devolve null", () => {
		expect(entradaCompleta({ model: "x" })).toBeNull();
		expect(entradaCompleta(null)).toBeNull();
		expect(entradaCompleta("lixo")).toBeNull();
	});

	it("content estranho (objeto solto) vira JSON, nunca crash", () => {
		expect(textoDaMensagem({ estranho: true })).toBe('{"estranho":true}');
	});
});

describe("comTeto — o mesmo formato de truncamento do plugin", () => {
	it("abaixo do teto, inteiro e sem marca", () => {
		const r = comTeto("abc", 10);
		expect(r).toEqual({ texto: "abc", meta: { truncated: false, orig_len: 3 } });
	});

	it("acima do teto, corta, marca o tamanho e dá sha256", () => {
		const texto = "x".repeat(50);
		const r = comTeto(texto, 10);
		expect(r.texto).toHaveLength(10);
		expect(r.meta).toMatchObject({ truncated: true, orig_len: 50, kept_len: 10 });
		expect(r.meta.sha256).toHaveLength(64);
	});
});

describe("tetoDoInput — PI_LANGFUSE_MAX_CHARS manda, 40.000 é o piso da casa", () => {
	it("env válida vence", () => {
		expect(tetoDoInput({ PI_LANGFUSE_MAX_CHARS: "1234" })).toBe(1234);
	});

	it("ausente, vazia ou lixo cai no 40.000 — nunca no 20.000 do plugin", () => {
		expect(tetoDoInput({})).toBe(40000);
		expect(tetoDoInput({ PI_LANGFUSE_MAX_CHARS: "" })).toBe(40000);
		expect(tetoDoInput({ PI_LANGFUSE_MAX_CHARS: "abc" })).toBe(40000);
		expect(tetoDoInput({ PI_LANGFUSE_MAX_CHARS: "0" })).toBe(40000);
	});
});

describe("anexarInputCompleto — anexa ao pai do plugin, e NUNCA derruba o turno", () => {
	let exporter: InMemorySpanExporter;

	const ligarProvider = () => {
		exporter = new InMemorySpanExporter();
		const provider = new NodeTracerProvider({
			spanProcessors: [new SimpleSpanProcessor(exporter)],
		});
		setLangfuseTracerProvider(provider as never);
		return () => setLangfuseTracerProvider(undefined as never);
	};

	afterEach(() => {
		exporter?.shutdown();
	});

	it("com envs ligadas e pai publicado, cria a observation com o input completo", () => {
		const desligar = ligarProvider();
		try {
			anexarInputCompleto(PAYLOAD_OPENAI, ENVS_DO_PAI);
			const spans = exporter.getFinishedSpans();
			expect(spans).toHaveLength(1);
			const attrs = spans[0].attributes;
			// o tipo correto e o pai do plugin: é o que faz a observation aparecer
			// aninhada embaixo da root "Conversational Turn" no Langfuse
			expect(attrs["langfuse.observation.type"]).toBe("generation");
			const input = JSON.parse(String(attrs["langfuse.observation.input"])) as {
				system?: string;
			};
			expect(input.system).toContain("PROMPT_DO_VENDEDOR");
			expect(spans[0].parentSpanContext?.traceId).toBe(ENVS_DO_PAI.LANGFUSE_PI_PARENT_TRACE_ID);
			expect(spans[0].parentSpanContext?.spanId).toBe(ENVS_DO_PAI.LANGFUSE_PI_PARENT_SPAN_ID);
		} finally {
			desligar();
		}
	});

	it("SEM as envs do Langfuse: zero span — o no-op do inviolável", () => {
		const desligar = ligarProvider();
		try {
			anexarInputCompleto(PAYLOAD_OPENAI, { PI_LANGFUSE_MAX_CHARS: "40000" });
			expect(exporter.getFinishedSpans()).toHaveLength(0);
		} finally {
			desligar();
		}
	});

	it("envs ligadas mas SEM pai publicado: zero span (não cria trace órfão)", () => {
		const desligar = ligarProvider();
		try {
			const semPai = { ...ENVS_DO_PAI } as Record<string, string | undefined>;
			delete semPai.LANGFUSE_PI_PARENT_TRACE_ID;
			delete semPai.LANGFUSE_PI_PARENT_SPAN_ID;
			anexarInputCompleto(PAYLOAD_OPENAI, semPai);
			expect(exporter.getFinishedSpans()).toHaveLength(0);
		} finally {
			desligar();
		}
	});

	it("sem provider nenhum no globalThis: engole e segue — observabilidade não derruba turno", () => {
		setLangfuseTracerProvider(undefined as never);
		expect(() => anexarInputCompleto(PAYLOAD_OPENAI, ENVS_DO_PAI)).not.toThrow();
	});

	it("payload lixo: engole e segue", () => {
		const desligar = ligarProvider();
		try {
			anexarInputCompleto("nao-e-payload", ENVS_DO_PAI);
			expect(exporter.getFinishedSpans()).toHaveLength(0);
		} finally {
			desligar();
		}
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
