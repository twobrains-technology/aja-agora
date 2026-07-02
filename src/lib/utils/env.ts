// Bug B-01: o guard antigo `process.env.NODE_ENV === "production"` quebrava
// LOCAL e DEV porque Next standalone roda sempre NODE_ENV=production. Em vez
// disso usamos TB_ENV (padrão TwoBrains) — só bloqueia se TB_ENV indicar
// produção EXPLÍCITA. Default permissive: ausente → habilitado.
//
// Convenção:
//   TB_ENV=local       → habilitado (dev local)
//   TB_ENV=dev         → habilitado (DEV AWS)
//   TB_ENV indefinido  → habilitado (fallback seguro pra ambientes não-prod)
//   TB_ENV=production  → BLOQUEADO
//   TB_ENV=prod        → BLOQUEADO (abreviação aceita)
export function isSimulatorEnabled(): boolean {
	// Override QA estreito: habilita o simulador em PROD sob demanda SEM flipar
	// TB_ENV. Flipar TB_ENV degradaria segurança (vazaria o devCode do OTP em
	// recovery.ts e afrouxaria rate-limit) — este flag afeta só esta função.
	// Default off: prod segue bloqueado a menos que o flag seja setado explícito.
	const force = (process.env.SIMULATOR_FORCE_ENABLE ?? "").toLowerCase().trim();
	if (force === "true" || force === "1") return true;

	const tbEnv = (process.env.TB_ENV ?? "").toLowerCase().trim();
	if (tbEnv === "production" || tbEnv === "prod") return false;
	return true;
}
