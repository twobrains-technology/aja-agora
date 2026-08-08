// Chave liga/desliga de TODA a observabilidade Langfuse. `?.trim() ||` de
// propósito: o compose materializa `${VAR:-}` como string VAZIA e `??` não
// cairia no fallback (mesmo footgun documentado em gateway-anthropic.ts).
export function isLangfuseConfigured(): boolean {
	return Boolean(
		process.env.LANGFUSE_PUBLIC_KEY?.trim() &&
			process.env.LANGFUSE_SECRET_KEY?.trim() &&
			process.env.LANGFUSE_BASE_URL?.trim(),
	);
}
