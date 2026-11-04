// Guarda estrita do playground (D-0056): só TB_ENV dev/local. Ausente = falso.
// Sem override (SIMULATOR_FORCE_ENABLE não vale aqui): o playground mexe em conduta.
export function isPlaygroundEnabled(): boolean {
	const tbEnv = (process.env.TB_ENV ?? "").toLowerCase().trim();
	return tbEnv === "dev" || tbEnv === "local";
}
