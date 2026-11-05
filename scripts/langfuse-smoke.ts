// SMOKE DE INGESTÃO NO LANGFUSE — bloco B1 do plano
// `docs/design/planos/2026-11-05-langfuse-suíte.md`.
//
// Cria 1 trace com 1 observation pelo MESMO caminho da produção
// (`@langfuse/otel` → `LangfuseSpanProcessor` → OTLP), mede quantos segundos
// leva até o `GET /api/public/v2/observations` devolver o span e fecha com
// código 0 só quando o span chega em menos de 30 s. Um span devolvido pelo GET
// é a prova de que não houve "Span not found in runMap" — esse erro é justamente
// a ingestão que nunca virou observação consultável.
//
// Credenciais: primeiro do ambiente (`LANGFUSE_BASE_URL`/`PUBLIC_KEY`/
// `SECRET_KEY`), depois do cofre (`secrets.sh get-key
// pi-agentes-aja-langfuse <CHAVE>`). Nunca gravar segredo em arquivo versionado;
// nada aqui imprime chave.

import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor, isLangfuseSpan } from "@langfuse/otel";
import { context, trace } from "@opentelemetry/api";
import { LANGFUSE_TRACER_NAME } from "@langfuse/core";

const COFRE = "pi-agentes-aja-langfuse";
const TETO_DE_INGESTAO_MS = 30_000;
const INTERVALO_DE_SONDAGEM_MS = 500;
const CAMINHO_DA_V2 = "/api/public/v2/observations";

export type Credenciais = {
	baseUrl: string;
	publicKey: string;
	secretKey: string;
	environment?: string;
};

/** Lê uma credencial do cofre (só o que falta; nunca imprime o valor). */
function doCofre(chave: string): string | undefined {
	try {
		const valor = execFileSync("secrets.sh", ["get-key", COFRE, chave], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return valor.length > 0 ? valor : undefined;
	} catch {
		return undefined;
	}
}

/** Ambiente primeiro, cofre depois. `null` = nada disponível: o smoke falha
 *  alto em vez de fingir vermelho verde. O leitor de cofre é injetável para o
 *  teste (padrão: o `secrets.sh` real). */
export function credenciais(
	env: Record<string, string | undefined> = process.env,
	lerCofre: (chave: string) => string | undefined = doCofre,
): Credenciais | null {
	const doAmbiente = (chave: string) => env[chave]?.trim() || undefined;
	const baseUrl = doAmbiente("LANGFUSE_BASE_URL") ?? lerCofre("LANGFUSE_BASE_URL");
	const publicKey = doAmbiente("LANGFUSE_PUBLIC_KEY") ?? lerCofre("LANGFUSE_PUBLIC_KEY");
	const secretKey = doAmbiente("LANGFUSE_SECRET_KEY") ?? lerCofre("LANGFUSE_SECRET_KEY");
	if (!baseUrl || !publicKey || !secretKey) return null;
	const environment =
		doAmbiente("LANGFUSE_TRACING_ENVIRONMENT") ?? lerCofre("LANGFUSE_TRACING_ENVIRONMENT");
	return { baseUrl, publicKey, secretKey, environment };
}

type RespostaV2 = { data?: Array<{ id?: string; traceId?: string; name?: string; type?: string }> };

/** Um GET na v2 (com fetch injetável para o teste). */
export async function buscarObservacoes(
	fetchFn: typeof fetch,
	cred: Credenciais,
	traceId: string,
): Promise<RespostaV2> {
	const autorizacao =
		"Basic " + Buffer.from(`${cred.publicKey}:${cred.secretKey}`).toString("base64");
	const resposta = await fetchFn(
		`${cred.baseUrl.replace(/\/$/, "")}${CAMINHO_DA_V2}?traceId=${encodeURIComponent(traceId)}`,
		{ headers: { Authorization: autorizacao }, signal: AbortSignal.timeout(10_000) },
	);
	if (!resposta.ok) return {};
	return (await resposta.json()) as RespostaV2;
}

/** Sonda a v2 até achar o span do trace — ou estourar o teto de ingestão. */
export async function aguardarObservacao(args: {
	fetchFn?: typeof fetch;
	cred: Credenciais;
	traceId: string;
	t0Ms: number;
}): Promise<{ encontrado: boolean; segundos: number }> {
	const fetchFn = args.fetchFn ?? fetch;
	const fim = args.t0Ms + TETO_DE_INGESTAO_MS;
	while (Date.now() <= fim) {
		const resposta = await buscarObservacoes(fetchFn, args.cred, args.traceId);
		const achou = (resposta.data ?? []).some(
			(o) => o.type === "SPAN" && o.name === "smoke-observacao",
		);
		if (achou) return { encontrado: true, segundos: (Date.now() - args.t0Ms) / 1000 };
		await new Promise((r) => setTimeout(r, INTERVALO_DE_SONDAGEM_MS));
	}
	return { encontrado: false, segundos: (Date.now() - args.t0Ms) / 1000 };
}

export async function executarSmoke(
	env: Record<string, string | undefined> = process.env,
	lerCofre: (chave: string) => string | undefined = doCofre,
): Promise<{
	ok: boolean;
	traceId?: string;
	segundos?: number;
	motivo?: string;
}> {
	const cred = credenciais(env, lerCofre);
	if (!cred) {
		return { ok: false, motivo: "sem credenciais no ambiente e no cofre — smoke não roda" };
	}

	const provider = new NodeTracerProvider({
		spanProcessors: [
			new LangfuseSpanProcessor({
				publicKey: cred.publicKey,
				secretKey: cred.secretKey,
				baseUrl: cred.baseUrl,
				environment: cred.environment,
				shouldExportSpan: ({ otelSpan }) => isLangfuseSpan(otelSpan),
			}),
		],
	});
	const tracer = provider.getTracer(LANGFUSE_TRACER_NAME);

	const sessionLabel = `smoke-${Date.now()}`;
	let otelTraceId = "";
	await tracer.startActiveSpan("smoke-trace", async (raiz) => {
		otelTraceId = raiz.spanContext().traceId;
		raiz.setAttribute("langfuse.session.id", sessionLabel);
		const dentro = trace.setSpan(context.active(), raiz);
		const filho = tracer.startSpan("smoke-observacao", {}, dentro);
		filho.setAttribute("smoke.trace_id", sessionLabel);
		filho.end();
		raiz.end();
	});

	const t0 = Date.now();
	await provider.forceFlush();
	const resultado = await aguardarObservacao({ cred, traceId: otelTraceId, t0Ms: t0 });
	await provider.shutdown();

	if (!resultado.encontrado) {
		return {
			ok: false,
			traceId: otelTraceId,
			segundos: resultado.segundos,
			motivo: `span não devolvido por ${CAMINHO_DA_V2} em ${resultado.segundos.toFixed(1)} s (teto ${TETO_DE_INGESTAO_MS / 1000} s) — sintoma do "Span not found in runMap"`,
		};
	}
	return {
		ok: resultado.segundos < TETO_DE_INGESTAO_MS / 1000,
		traceId: otelTraceId,
		segundos: resultado.segundos,
	};
}

// A execução direta só acontece quando este arquivo é o processo principal —
// o teste importa as funções sem disparar rede.
function ehProcessoPrincipal(): boolean {
	const alvo = process.argv[1];
	if (!alvo) return false;
	const alvoAbs = isAbsolute(alvo) ? alvo : resolve(alvo);
	return import.meta.url === `file://${alvoAbs}`;
}

if (ehProcessoPrincipal()) {
	void (async () => {
		const resultado = await executarSmoke();
		if (resultado.ok) {
			console.log(
				`ingestão: ${resultado.segundos?.toFixed(1)} s — span devolvido pela v2 (trace ${resultado.traceId})`,
			);
			process.exit(0);
		}
		console.error(`[langfuse-smoke] FALHOU: ${resultado.motivo ?? "motivo desconhecido"}`);
		process.exit(1);
	})();
}
