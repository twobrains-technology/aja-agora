// Bootstrap do tracing OTel→Langfuse. Chamado UMA vez pelo instrumentation.ts
// do Next (e pelos scripts de eval). Idempotente via globalThis — o HMR do
// `next dev` re-executa o hook e sem o guard duplicaria o processor (cada
// trace sairia duas vezes). Este módulo só entra via dynamic import no runtime
// nodejs, então os imports estáticos do SDK não vazam pro bundle do client.
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { getLangfuseClient } from "./client";
import { ambienteLangfuse, isLangfuseConfigured, release } from "./env";
import { maskSecrets } from "./mask";

type LangfuseGlobal = typeof globalThis & {
	__ajaLangfuseProcessor?: LangfuseSpanProcessor;
};

export function initLangfuseTracing(): void {
	const g = globalThis as LangfuseGlobal;
	if (g.__ajaLangfuseProcessor) return;
	if (!isLangfuseConfigured()) return;
	try {
		const processor = new LangfuseSpanProcessor({
			publicKey: process.env.LANGFUSE_PUBLIC_KEY?.trim(),
			secretKey: process.env.LANGFUSE_SECRET_KEY?.trim(),
			baseUrl: process.env.LANGFUSE_BASE_URL?.trim(),
			// Sem isto TUDO cai no ambiente "default" e produção fica misturada com
			// dev/local no mesmo gráfico — qualquer média de qualidade sai
			// contaminada por conversa de teste. O filtro de ambiente é global na
			// UI, então separar aqui conserta todas as views de uma vez.
			environment: ambienteLangfuse(),
			// Carimba o commit em TODO span. É o que permite ler "esse defeito
			// começou no deploy X" em vez de comparar timestamps na mão.
			...(release() ? { release: release() } : {}),
			mask: maskSecrets,
			// Registrar um provider global ACORDA o OTel nativo do Next — sem este
			// filtro, TODO request HTTP (inclusive os pollings de 3s do simulador)
			// viraria trace e inundaria o projeto. Só exporta spans dos SDKs que
			// interessam: @langfuse/* (turn/tools/langchain) e "ai" (analyzer via
			// experimental_telemetry). Atenção: a opção SUBSTITUI o filtro default.
			shouldExportSpan: ({
				otelSpan,
			}: {
				otelSpan: { instrumentationScope?: { name?: string } };
			}) => {
				const scope = otelSpan.instrumentationScope?.name ?? "";
				return scope.startsWith("langfuse") || scope === "ai";
			},
		});
		const provider = new NodeTracerProvider({ spanProcessors: [processor] });
		provider.register();
		g.__ajaLangfuseProcessor = processor;
		console.log("[langfuse] tracing ativo →", process.env.LANGFUSE_BASE_URL);
	} catch (err) {
		console.error("[langfuse] init falhou — seguindo SEM observabilidade:", err);
	}
}

/** Flush explícito (fim de script curto / after() de rota). Nunca lança.
 *
 *  São DOIS buffers independentes e esquecer o segundo é falha silenciosa: os
 *  spans saem pelo `LangfuseSpanProcessor` (OTel), mas os scores saem pelo
 *  `ScoreManager` do LangfuseClient, que tem fila própria. Só o `forceFlush`
 *  do processor deixava score de fim de turno para trás num processo que
 *  encerra logo depois (script de eval, lambda-like). */
export async function flushLangfuse(): Promise<void> {
	const g = globalThis as LangfuseGlobal;
	try {
		await g.__ajaLangfuseProcessor?.forceFlush();
	} catch (err) {
		console.error("[langfuse] flush de spans falhou (ignorado):", err);
	}
	try {
		await getLangfuseClient()?.score.flush();
	} catch (err) {
		console.error("[langfuse] flush de scores falhou (ignorado):", err);
	}
}
