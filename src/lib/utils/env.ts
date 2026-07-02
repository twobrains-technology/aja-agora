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
//
// Override explícito (QA da jornada em produção): SIMULATOR_FORCE_ENABLE=true|1
// libera o simulador MESMO em prod, sem mexer em TB_ENV (que dirige roteamento
// LiteLLM/identidade/logging de prod). Default ausente/qualquer-outro-valor →
// mantém o bloqueio de prod. Usar pontualmente e reverter após o QA.
export function isSimulatorEnabled(): boolean {
	const forceEnable = (process.env.SIMULATOR_FORCE_ENABLE ?? "").toLowerCase().trim();
	if (forceEnable === "true" || forceEnable === "1") return true;
	const tbEnv = (process.env.TB_ENV ?? "").toLowerCase().trim();
	if (tbEnv === "production" || tbEnv === "prod") return false;
	return true;
}
