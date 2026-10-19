// Hook de instrumentation do Next 16 (estável).
//
// Depois de 19/10/2026 não há tracing de terceiro para ligar: a observabilidade
// do turno é local (`observability/sinais/publicar.ts` e o `turn-trace` no
// banco). O arquivo fica porque o Next o exige quando existir qualquer
// instrumentation a registrar — hoje não há nenhuma.
export async function register(): Promise<void> {
	// intencionalmente vazio
}
