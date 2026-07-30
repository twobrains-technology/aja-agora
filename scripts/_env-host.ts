// Bootstrap de env para SCRIPTS rodados no HOST (`tsx scripts/...`).
//
// Importe primeiro, antes de qualquer coisa que toque `@/db` ou o gateway:
//
//   import "./_env-host";
//
// Dois problemas, os dois já pagos caro:
//
// 1. `tsx` não carrega `.env.local` (o Next carrega; um script solto não). Sem
//    isto o `src/db/index.ts` estoura na importação com "DATABASE_URL is not
//    set", e o script parece quebrado quando só falta env.
//
// 2. O `.env.local` é escrito pro APP, que roda em CONTAINER: os hosts são nomes
//    de serviço (`aja-shared-pg`, `tb-litellm-shared`), que não resolvem do Mac.
//    O sintoma é pior que um erro: o Postgres dá `ENOTFOUND` e o gateway dá
//    TIMEOUT, e o timeout do analyzer cai no fallback `neutral` — a sonda passa a
//    medir o fallback dela mesma e reporta o oposto do que está acontecendo.
//    O OrbStack resolve o mesmo nome com `.orb.local` a partir do host.
//
// Espelha `vitest.setup.ts` de propósito: é a mesma tradução, e ter as duas
// pontas com o mesmo comportamento é o que evita "no teste passa, na sonda não".
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

for (const arquivo of [".env.local", ".env.test", ".env"]) {
	try {
		loadEnvFile(arquivo);
	} catch {
		// opcional — o primeiro que existir preenche; os seguintes não sobrescrevem
	}
}

if (!existsSync("/.dockerenv")) {
	const paraHost = (url: string | undefined): string | undefined => {
		if (!url) return url;
		try {
			const u = new URL(url);
			if (u.hostname.includes(".") || u.hostname === "localhost") return url;
			u.hostname = `${u.hostname}.orb.local`;
			return u.toString();
		} catch {
			return url;
		}
	};
	const db = paraHost(process.env.DATABASE_URL);
	if (db) process.env.DATABASE_URL = db;
	const gw = paraHost(process.env.LITELLM_BASE_URL);
	if (gw) process.env.LITELLM_BASE_URL = gw;
}

// O SRV de Cloud Map só existe dentro da VPC; do host ele resolve pra nada e o
// `resolveGatewayHost` devolveria null → fetch direto pra api.anthropic.com (a
// chave com cota estourada). Fora de container, a base URL manda.
if (!existsSync("/.dockerenv")) delete process.env.LITELLM_SRV_NAME;
