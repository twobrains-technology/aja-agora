// Hook de instrumentation do Next 16 (estável). Único efeito: ligar o tracing
// Langfuse quando as envs existem — sem elas é no-op total (nem import do SDK).
export async function register(): Promise<void> {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { initLangfuseTracing } = await import("@/lib/observability/langfuse/setup");
		initLangfuseTracing();
	}
}
