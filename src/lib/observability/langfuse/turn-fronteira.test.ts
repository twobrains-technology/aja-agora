// FRONTEIRA DA MEDIÇÃO DO TURNO — uma só, e é a mesma dos dois lados.
//
// A observação `turn` (Langfuse) e o `durationMs` do `turn-trace` fecham quando
// o stream do turno acabou, então os DOIS números cobrem o turno inteiro,
// inclusive a fase PRÉ-LLM (`analyze` e a pré-produção do grafo) — não só a
// geração. Medir pela geração devolve um número menor, e foi essa diferença
// (5,6 s no Langfuse contra 8,8 s no registro do app) que o relatório de
// 21/09/2026 leu como desalinhamento; no mesmo turno os dois coincidem.
//
// Spans REAIS aqui (SDK do Langfuse + exportador OTel em memória): o que se
// afirma é o que sairia para o Langfuse.
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const exportador = new InMemorySpanExporter();
new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exportador)] }).register();

import { TurnTrace, type TurnTraceRecord } from "@/lib/telemetry/turn-trace";
import { withLangfuseTurn } from "./turn";

const KEYS = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"] as const;
let salvo: Record<string, string | undefined>;

const CTX = {
	conversationId: "conv-fronteira",
	channel: "web" as const,
	isSimulated: false,
	persona: null,
	userId: "uid-1",
	userText: "oi",
};

/** Fase PRÉ-LLM do turno (o `analyze` e a pré-produção do grafo). */
const FASE_PRE_LLM_MS = 60;
/** O modelo falando. */
const FASE_DA_GERACAO_MS = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function latenciaDaObservacao(nome: string): number {
	exportador.forceFlush();
	const s = exportador.getFinishedSpans().find((span) => span.name === nome);
	if (!s) throw new Error(`observação ${nome} não nasceu`);
	const emMs = (t: [number, number]) => t[0] * 1000 + t[1] / 1e6;
	return emMs(s.endTime as [number, number]) - emMs(s.startTime as [number, number]);
}

beforeEach(() => {
	salvo = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
	for (const k of KEYS) delete process.env[k];
	process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-teste";
	process.env.LANGFUSE_SECRET_KEY = "sk-lf-teste";
	process.env.LANGFUSE_BASE_URL = "https://langfuse.exemplo.com";
	exportador.reset();
});

afterEach(() => {
	for (const k of KEYS) {
		if (salvo[k] === undefined) delete process.env[k];
		else process.env[k] = salvo[k];
	}
});

describe("fronteira da medição do turno", () => {
	it("a observação `turn` cobre a fase pré-LLM e só fecha no fim do stream", async () => {
		await withLangfuseTurn(CTX, async (turn) => {
			await sleep(FASE_PRE_LLM_MS);
			await sleep(FASE_DA_GERACAO_MS);
			turn.setOutput("pronto");
		});

		expect(latenciaDaObservacao("turn")).toBeGreaterThanOrEqual(
			FASE_PRE_LLM_MS + FASE_DA_GERACAO_MS - 10,
		);
	});

	it("o registro do app e a observação `turn` medem a MESMA janela", async () => {
		let registro: TurnTraceRecord | null = null;
		// O chamador real (route.ts) cria o TurnTrace imediatamente antes do
		// wrapper e finaliza dentro dele — a mesma ordem exercitada aqui.
		const trace = new TurnTrace(
			{ conversationId: "conv-fronteira", channel: "web" },
			{
				now: () => Date.now(),
				newId: () => "turno-de-teste",
				sink: (r) => {
					registro = r;
				},
			},
		);

		await withLangfuseTurn(CTX, async (turn) => {
			await sleep(FASE_PRE_LLM_MS);
			await sleep(FASE_DA_GERACAO_MS);
			turn.setOutput("pronto");
			trace.finalize();
		});

		const doRegistro = (registro as TurnTraceRecord | null)?.durationMs ?? -1;
		expect(doRegistro).toBeGreaterThanOrEqual(FASE_PRE_LLM_MS + FASE_DA_GERACAO_MS - 10);
		expect(Math.abs(latenciaDaObservacao("turn") - doRegistro)).toBeLessThan(200);
	});
});
