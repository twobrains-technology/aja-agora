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

// A VITRINE NASCE DESLIGADA NA SUÍTE.
//
// `VITRINE_CPF`/`VITRINE_CELULAR` mudam o FUNIL (a busca deixa de exigir o CPF
// do cliente), e o `.env.local` de quem desenvolve a feature os tem. Herdá-los
// aqui faz testes que nada têm a ver com a vitrine mudarem de comportamento:
// `route.closing-persistence` passou a disparar busca REAL na Bevi num cenário
// pré-reveal e a estourar 20s de timeout — com a suíte "verde" para quem rodava
// só o filtro de unit, que exclui `route*`.
//
// Quem TESTA a vitrine a liga explicitamente no próprio arquivo (e restaura
// depois). Default desligado mantém a suíte hermética e reproduzível em
// qualquer máquina, com ou sem `.env.local`.
process.env.VITRINE_CPF = "";
process.env.VITRINE_CELULAR = "";

// ── ANALYTICS NÃO SAI PARA A REDE NA SUÍTE ──
//
// `navigator.sendBeacon` do `happy-dom` NÃO é um no-op: ele abre uma requisição
// HTTP de verdade. Como os beacons deste produto apontam para caminhos
// relativos, o `happy-dom` os resolve contra `http://localhost:3000` — e com o
// servidor de desenvolvimento de pé, um `pnpm test:unit` passava a gravar
// `chat_iniciado` e eventos de mapa de calor no banco local, a partir de testes
// de COMPONENTE que só queriam renderizar uma tela.
//
// Pior que a escrita indevida era o efeito na suíte: a requisição é abortada no
// teardown do ambiente, a rejeição escapa de dentro do `Fetch` do `happy-dom`
// (fora do alcance do `.catch` de quem chamou) e o vitest a reporta como
// `Unhandled Rejection`. Resultado em 30/08/2026: **3.718 testes verdes na tela
// e exit 1**, com dez erros que não pertenciam a teste nenhum.
//
// A troca por um no-op é a regra de higiene que faltava, não uma gambiarra:
// teste unitário não faz rede. Quem precisar afirmar que o beacon foi
// DISPARADO continua podendo — basta espionar `navigator.sendBeacon` no próprio
// arquivo, que é o que um teste de analytics deve fazer.
if (typeof globalThis.navigator === "object" && globalThis.navigator !== null) {
	Object.defineProperty(globalThis.navigator, "sendBeacon", {
		configurable: true,
		writable: true,
		value: () => true,
	});
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
