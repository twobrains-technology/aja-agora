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
	const tbEnv = (process.env.TB_ENV ?? "").toLowerCase().trim();
	if (tbEnv === "production" || tbEnv === "prod") return false;
	return true;
}
