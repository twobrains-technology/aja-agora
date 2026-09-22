// Handler do LangChain por turno — os DOIS fechamentos que a produção mediu
// (Langfuse 21/09/2026, traces `0208e0e6`, `87293497`, `ba4dbe6f`):
//
//  (1) a pausa `interrupt()` do nó `human` chegava ao trace como `level=ERROR`
//      em 100% dos turnos — alerta que grita sempre é alerta que ninguém lê;
//  (2) a geração precisa carregar QUAL modelo falou, senão o turno não é
//      atribuível a modelo nenhum.
//
// Os spans aqui são REAIS (o SDK do Langfuse + um exportador OTel em memória):
// o que se afirma é o que sairia para o Langfuse, não o que um mock devolveu.

import { AIMessageChunk } from "@langchain/core/messages";
import { CallbackHandler } from "@langfuse/langchain";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const exportador = new InMemorySpanExporter();
new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exportador)] }).register();

import { makeLangfuseCallbackHandler, nomeDoModeloDaGeracao } from "./langchain";

const KEYS = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"] as const;
let salvo: Record<string, string | undefined>;

/** A MESMA marca que o dossiê do alerta filtra (`alerta/dossie.ts`). */
const PAUSA_DO_GRAFO =
	'GraphInterrupt: [\n  {\n    "value": "aguardando-resposta-do-usuario"\n  }\n]';

const NIVEIS = "langfuse.observation.level";
const MENSAGEM = "langfuse.observation.status_message";
const MODELO = "langfuse.observation.model.name";

function configurar() {
	process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-teste";
	process.env.LANGFUSE_SECRET_KEY = "sk-lf-teste";
	process.env.LANGFUSE_BASE_URL = "https://langfuse.exemplo.com";
}

/** O handler real é um `CallbackHandler`; o tipo público da fábrica é o mínimo
 *  (`BaseCallbackHandler`) porque é isso que o `graph.stream` consome. */
function handlerDoTurno(): CallbackHandler {
	return makeLangfuseCallbackHandler() as unknown as CallbackHandler;
}

function span(nome: string) {
	exportador.forceFlush();
	return exportador.getFinishedSpans().find((s) => s.name === nome);
}

/** Corrente serializada mínima — `handleChainStart` só usa `.id`/nome. */
function corrente(nome: string) {
	return { lc: 1, type: "constructor", id: ["langchain_core", "runnables", nome], kwargs: {} };
}

/** Modelo serializado como o `toJSON()` de um `ChatAnthropic` entrega. */
function modeloSerializado(nome: string) {
	return {
		lc: 1,
		type: "constructor",
		id: ["langchain", "chat_models", "anthropic"],
		kwargs: { model: nome },
	};
}

/** Fecha a generation do run com uso declarado — sem `usage_metadata` o SDK
 *  do Langfuse estoura ao ler `promptTokens` e o span nunca é exportado. */
async function fecharGeracao(h: CallbackHandler, runId: string) {
	await h.handleLLMEnd(
		{
			generations: [
				[
					{
						text: "oi",
						message: new AIMessageChunk({
							content: "oi",
							usage_metadata: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
						}),
					},
				],
			],
		} as never,
		runId,
	);
}

beforeEach(() => {
	salvo = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
	for (const k of KEYS) delete process.env[k];
	exportador.reset();
	configurar();
});

afterEach(() => {
	for (const k of KEYS) {
		if (salvo[k] === undefined) delete process.env[k];
		else process.env[k] = salvo[k];
	}
});

describe("handler do turno — pausa do grafo", () => {
	it("fecha o span do `human` SEM level ERROR e sem statusMessage de erro", async () => {
		const h = handlerDoTurno();
		await h.handleChainStart(corrente("human") as never, { input: "oi" }, "run-pausa");
		await h.handleChainError(new Error(PAUSA_DO_GRAFO), "run-pausa");

		const doHuman = span("human");
		expect(doHuman).toBeDefined();
		expect(doHuman?.attributes[NIVEIS]).not.toBe("ERROR");
		expect(String(doHuman?.attributes[MENSAGEM] ?? "")).not.toContain("GraphInterrupt");
	});

	it("erro DE VERDADE continua ERROR (a pausa não virou mordaça)", async () => {
		const h = handlerDoTurno();
		await h.handleChainStart(corrente("converse") as never, { input: "oi" }, "run-erro");
		await h.handleChainError(new Error("boom do agente"), "run-erro");

		expect(span("converse")?.attributes[NIVEIS]).toBe("ERROR");
	});

	it("desligado: sem handler, nenhuma observação nasce", () => {
		for (const k of KEYS) delete process.env[k];
		expect(makeLangfuseCallbackHandler()).toBeUndefined();
	});
});

describe("handler do turno — modelo da geração", () => {
	it("nomeDoModeloDaGeracao: invocação → carimbo → o que o modelo carrega", () => {
		expect(
			nomeDoModeloDaGeracao(
				modeloSerializado("do-modelo"),
				{ invocation_params: { model: "da-invocacao" } },
				{ ls_model_name: "do-carimbo" },
			),
		).toBe("da-invocacao");
		expect(
			nomeDoModeloDaGeracao(
				modeloSerializado("do-modelo"),
				{ invocation_params: {} },
				{ ls_model_name: "do-carimbo" },
			),
		).toBe("do-carimbo");
		expect(
			nomeDoModeloDaGeracao(modeloSerializado("do-modelo"), { invocation_params: {} }, {}),
		).toBe("do-modelo");
		expect(nomeDoModeloDaGeracao({ lc: 1, type: "not_implemented" }, {}, {})).toBeNull();
	});

	it("a geração sai com o modelo que o provider conhece, mesmo sem `invocation_params.model`", async () => {
		const h = handlerDoTurno();
		await h.handleGenerationStart(
			modeloSerializado("claude-haiku-4-5") as never,
			[],
			"run-geracao",
			undefined,
			{ invocation_params: {} },
			[],
			{},
			"converse",
		);
		await fecharGeracao(h, "run-geracao");

		expect(span("converse")?.attributes[MODELO]).toBe("claude-haiku-4-5");
	});

	it("o modelo da invocação é o que falou de fato quando os dois existem", async () => {
		const h = handlerDoTurno();
		await h.handleGenerationStart(
			modeloSerializado("do-modelo") as never,
			[],
			"run-geracao-2",
			undefined,
			{ invocation_params: { model: "qwen3.8-flash" } },
			[],
			{ ls_model_name: "do-carimbo" },
			"converse",
		);
		await fecharGeracao(h, "run-geracao-2");

		expect(span("converse")?.attributes[MODELO]).toBe("qwen3.8-flash");
	});

	it("fábrica entrega o wrapper (o handler do turno É o do Langfuse)", () => {
		expect(handlerDoTurno()).toBeInstanceOf(CallbackHandler);
	});
});
