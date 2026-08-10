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

/**
 * Ambiente Langfuse deste processo — separa produção de dev/local.
 *
 * O servidor impõe `^(?!langfuse)[a-z0-9-_]+$` com no máximo 40 caracteres, e
 * ambiente criado por engano é PERMANENTE (a UI não deixa renomear nem apagar).
 * Por isso a normalização é agressiva: minúsculas, caractere inválido vira `-`,
 * corta em 40 e cai em `development` se sobrar vazio. Um typo em produção
 * custaria um ambiente fantasma para sempre.
 */
export function ambienteLangfuse(): string {
	const bruto = process.env.LANGFUSE_TRACING_ENVIRONMENT?.trim() || process.env.NODE_ENV || "";
	const limpo = bruto
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, "-")
		.replace(/^langfuse/, "lf")
		.slice(0, 40);
	return limpo || "development";
}

/** Commit em produção, para ler "esse defeito começou no deploy X". */
export function release(): string | undefined {
	return (
		process.env.LANGFUSE_RELEASE?.trim() || process.env.GIT_SHA?.trim()?.slice(0, 12) || undefined
	);
}
