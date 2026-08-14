import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

// Ordem importa: loadEnvFile NÃO sobrescreve vars já setadas.
// Carrega prioridade mais alta PRIMEIRO (local-dev/test) e .env como baseline.
// Integration tests dependem de DATABASE_URL do .env.local (workspace OrbStack
// aponta Postgres em 5434; .env legacy aponta 5433).
try {
	loadEnvFile(".env.local");
} catch {
	// .env.local opcional (CI/produção usam env nativo)
}
try {
	loadEnvFile(".env.test");
} catch {
	// .env.test opcional (override explícito de teste)
}
try {
	loadEnvFile(".env");
} catch {
	// .env opcional (baseline; só preenche o que ainda não foi setado)
}

// Sentinel DATABASE_URL pra módulos que importam @/db em testes que não tocam DB.
// Em testes que de fato consultam DB, override no próprio test ou via .env real.
if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test_sentinel";
}

// ── DNS de container → DNS do host (OrbStack) ──
//
// O `.env.local` é escrito pro APP, que roda em container: os hosts são nomes de
// serviço (`aja-shared-pg`, `tb-litellm-shared`). Do HOST esses nomes não
// resolvem, e o sintoma é ruim de diagnosticar: os cenários de jornada
// falhavam com `ENOTFOUND` no `pnpm test:unit` e a sonda de intent caía em
// timeout → fallback `neutral`, parecendo dizer o contrário do que media. O
// `describeIfDb` dos cenários não protege disso: ele checa se `DATABASE_URL`
// EXISTE, não se responde.
//
// O OrbStack resolve o mesmo nome com o sufixo `.orb.local` a partir do Mac,
// então a tradução é mecânica. Só age fora de container (`/.dockerenv` ausente)
// e só em host de uma única label — nome com ponto ou `localhost` fica intacto.
if (!existsSync("/.dockerenv")) {
	const paraHost = (url: string | undefined): string | undefined => {
		if (!url) return url;
		try {
			const u = new URL(url);
			// `toString()` NORMALIZA acrescentando a barra do path vazio, e quem
			// concatena (`${base}/v1/messages`) acaba com `//v1/messages` — o LiteLLM
			// responde 404 nisso. O `scripts/_env-host.ts` já apanhou do mesmo
			// footgun e o corrige; aqui faltava.
			const semBarra = (u2: URL) => u2.toString().replace(/\/$/, "");
			// `host.docker.internal` é como o CONTAINER chama o Mac — do lado de cá
			// ele não resolve ("Unknown host"), e a regra do ponto abaixo o deixava
			// passar intacto: o teste que toca o LLM ficava pendurado até estourar o
			// timeout, com cara de bug do produto. Do host, o mesmo endereço é o
			// loopback, onde o túnel SSM do LiteLLM publica.
			//
			// ⚠️ Isto exige o túnel VIVO, não só a porta aberta. Sessão SSM expirada
			// deixa um listener órfão que aceita a conexão e nunca responde — pior
			// que não ter túnel, porque falha lenta em vez de falha rápida. Sintoma:
			// vários testes de integração estourando timeout ao mesmo tempo.
			// Confira com `curl -m 5 http://127.0.0.1:4100/health` (401 = vivo).
			if (u.hostname === "host.docker.internal") {
				u.hostname = "127.0.0.1";
				return semBarra(u);
			}
			if (u.hostname.includes(".") || u.hostname === "localhost") return url;
			u.hostname = `${u.hostname}.orb.local`;
			return semBarra(u);
		} catch {
			return url;
		}
	};
	const db = paraHost(process.env.DATABASE_URL);
	if (db) process.env.DATABASE_URL = db;
	const gw = paraHost(process.env.LITELLM_BASE_URL);
	if (gw) process.env.LITELLM_BASE_URL = gw;
}
