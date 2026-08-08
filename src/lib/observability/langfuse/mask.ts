// Máscara de SEGREDOS aplicada a todo atributo exportado pro Langfuse
// (opção `mask` do LangfuseSpanProcessor). Dado de negócio (CPF, telefone,
// valores) passa — a instância é self-hosted nossa; quem mascara PII de log
// de console é o maskPii (tool-io-log.ts), outro contrato.

const SENSITIVE_ENV_KEYS = [
	"ANTHROPIC_API_KEY",
	"LITELLM_API_KEY",
	"BEVI_API_TOKEN",
	"LANGFUSE_SECRET_KEY",
	"BETTER_AUTH_SECRET",
	"IDENTITY_ENC_KEY",
	"WHATSAPP_ACCESS_TOKEN",
	"WHATSAPP_APP_SECRET",
	"SENDGRID_API_KEY",
] as const;

const SECRET_PATTERNS: readonly RegExp[] = [
	/sk-ant-[\w-]+/g,
	/sk-lf-[\w-]+/g,
	/pk-lf-[\w-]+/g,
	/Bearer\s+[\w.~+/-]+=*/g,
];

const REDACTED = "[REDACTED]";

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function maskSecrets({ data }: { data: string }): string {
	if (!data) return data;
	let out = data;
	for (const key of SENSITIVE_ENV_KEYS) {
		const value = process.env[key]?.trim();
		if (!value) continue;
		out = out.replace(new RegExp(escapeRegExp(value), "g"), REDACTED);
	}
	for (const pattern of SECRET_PATTERNS) {
		out = out.replace(pattern, REDACTED);
	}
	return out;
}
