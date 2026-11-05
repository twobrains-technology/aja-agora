// CUSTO POR CONVERSA NO LANGFUSE — bloco B12 do plano
// `docs/design/planos/2026-11-05-langfuse-suíte.md`.
//
// Agrega o custo (`sum_totalCost`) das generations de cada session e grava o
// score NUMERIC `custo_conversa` por sessionId. Não há agregação nativa por
// session em score: o caminho é o `GET /api/public/v2/metrics` (dimensão
// `sessionId`, medida `totalCost` soma) — a listagem de observations
// (`/api/public/v2/observations`) devolve `totalPrice: null`.
//
// Idempotente: o POST leva `id = custo_conversa-<sessionId>` — na API do
// Langfuse, `id` no corpo é upsert; reruns atualizam o mesmo score em vez de
// duplicar. Sessions sem custo (> 0) não são pontuadas.
//
// Sem credenciais (ambiente e cofre) = no-op: falha de observabilidade nunca
// derruba nada. Credenciais: ambiente (`LANGFUSE_BASE_URL`/`PUBLIC_KEY`/
// `SECRET_KEY`), depois cofre (`secrets.sh get-key
// pi-agentes-aja-langfuse <CHAVE>`). Nada aqui imprime chave.
//
// Nota da instância (v4, `events_only`): `POST /api/public/v3/scores` devolve
// 405; a gravação vai por `POST /api/public/scores` (o que a própria mensagem
// de deprecação indica: leitura nova em `/v3/scores`, gravação segue em
// `/scores`).
//
// GATE: `pnpm tsx scripts/langfuse-custo-conversa.ts` → pelo menos uma session
// real com score `custo_conversa` gravado; rerun não duplica.

import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

const COFRE = "pi-agentes-aja-langfuse";
const NOME_DO_SCORE = "custo_conversa";
export const JANELA_PADRAO_DIAS = 30;

type Credenciais = { baseUrl: string; publicKey: string; secretKey: string };

/** Lê uma credencial do cofre (nunca imprime o valor). */
function doCofre(chave: string): string | undefined {
	try {
		const valor = execFileSync("secrets.sh", ["get-key", COFRE, chave], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return valor.length > 0 ? valor : undefined;
	} catch {
		return undefined;
	}
}

export function credenciais(
	env: Record<string, string | undefined> = process.env,
	lerCofre: (chave: string) => string | undefined = doCofre,
): Credenciais | null {
	const doAmbiente = (chave: string) => env[chave]?.trim() || undefined;
	const baseUrl = doAmbiente("LANGFUSE_BASE_URL") ?? lerCofre("LANGFUSE_BASE_URL");
	const publicKey = doAmbiente("LANGFUSE_PUBLIC_KEY") ?? lerCofre("LANGFUSE_PUBLIC_KEY");
	const secretKey = doAmbiente("LANGFUSE_SECRET_KEY") ?? lerCofre("LANGFUSE_SECRET_KEY");
	if (!baseUrl || !publicKey || !secretKey) return null;
	return { baseUrl, publicKey, secretKey };
}

function autorizacao(cred: Credenciais): string {
	return "Basic " + Buffer.from(`${cred.publicKey}:${cred.secretKey}`).toString("base64");
}

type RespostaMetrics = { data?: Array<Record<string, number | string | null>> };

/** Soma o custo por session via v2/metrics (dimensão sessionId, medida
 *  `totalCost`). `row_limit` + orderBy desc são exigidos por dimensão de alta
 *  cardinalidade. Janela fechada de `dias` até agora (padrão 30). */
export async function custoPorSession(
	fetchFn: typeof fetch,
	cred: Credenciais,
	dias: number = JANELA_PADRAO_DIAS,
): Promise<Array<{ sessionId: string; custo: number }>> {
	const agora = new Date();
	const de = new Date(agora.getTime() - dias * 86_400_000);
	const consulta = {
		view: "observations",
		metrics: [{ measure: "totalCost", aggregation: "sum" }],
		dimensions: [{ field: "sessionId" }],
		orderBy: [{ field: "sum_totalCost", direction: "desc" }],
		config: { row_limit: 1000 },
		fromTimestamp: de.toISOString(),
		toTimestamp: agora.toISOString(),
	};
	const resposta = await fetchFn(
		`${cred.baseUrl.replace(/\/$/, "")}/api/public/v2/metrics?query=${encodeURIComponent(
			JSON.stringify(consulta),
		)}`,
		{
			headers: { Authorization: autorizacao(cred) },
			signal: AbortSignal.timeout(15_000),
		},
	);
	if (!resposta.ok) {
		throw new Error(`GET /api/public/v2/metrics → HTTP ${resposta.status}`);
	}
	const corpo = (await resposta.json()) as RespostaMetrics;
	return (corpo.data ?? [])
		.filter(
			(linha): linha is { sessionId: string; sum_totalCost: number } =>
				typeof linha.sessionId === "string" &&
				linha.sessionId.length > 0 &&
				typeof linha.sum_totalCost === "number",
		)
		.map((linha) => ({ sessionId: linha.sessionId, custo: linha.sum_totalCost }));
}

/** Grava (upsert por `id` determinístico) o score NUMERIC por session. */
export async function gravarScoreCusto(
	fetchFn: typeof fetch,
	cred: Credenciais,
	sessionId: string,
	custo: number,
): Promise<{ status: number; ok: boolean; id?: string }> {
	const resposta = await fetchFn(`${cred.baseUrl.replace(/\/$/, "")}/api/public/scores`, {
		method: "POST",
		headers: { Authorization: autorizacao(cred), "Content-Type": "application/json" },
		body: JSON.stringify({
			id: `${NOME_DO_SCORE}-${sessionId}`,
			sessionId,
			name: NOME_DO_SCORE,
			value: custo,
			dataType: "NUMERIC",
		}),
		signal: AbortSignal.timeout(15_000),
	});
	if (!resposta.ok) return { status: resposta.status, ok: false };
	const corpo = (await resposta.json()) as { id?: string };
	return { status: resposta.status, ok: true, id: corpo.id };
}

export type ResultadoExecucao = {
	ok: boolean;
	noOp?: string;
	pontuadas: Array<{ sessionId: string; custo: number }>;
	falhas: string[];
};

export async function executar(
	env: Record<string, string | undefined> = process.env,
	fetchFn: typeof fetch = fetch,
	dias: number = JANELA_PADRAO_DIAS,
	lerCofre: (chave: string) => string | undefined = doCofre,
): Promise<ResultadoExecucao> {
	const cred = credenciais(env, lerCofre);
	if (!cred) {
		return {
			ok: true,
			noOp: "sem credenciais no ambiente e no cofre — no-op (Langfuse é acessório ao turno)",
			pontuadas: [],
			falhas: [],
		};
	}

	const linhas = await custoPorSession(fetchFn, cred, dias);
	const elegiveis = linhas.filter((l) => l.custo > 0);

	const pontuadas: Array<{ sessionId: string; custo: number }> = [];
	const falhas: string[] = [];
	for (const linha of elegiveis) {
		const resultado = await gravarScoreCusto(fetchFn, cred, linha.sessionId, linha.custo);
		if (resultado.ok) {
			pontuadas.push({ sessionId: linha.sessionId, custo: linha.custo });
		} else {
			falhas.push(
				`POST /api/public/scores para session ${linha.sessionId} → HTTP ${resultado.status}`,
			);
		}
	}
	return { ok: falhas.length === 0, pontuadas, falhas };
}

function ehProcessoPrincipal(): boolean {
	const alvo = process.argv[1];
	if (!alvo) return false;
	const alvoAbs = isAbsolute(alvo) ? alvo : resolve(alvo);
	return import.meta.url === `file://${alvoAbs}`;
}

if (ehProcessoPrincipal()) {
	void (async () => {
		const dias = process.env.CUSTO_JANELA_DIAS
			? Number(process.env.CUSTO_JANELA_DIAS)
			: JANELA_PADRAO_DIAS;
		const resultado = await executar(process.env, fetch, dias);
		if (resultado.noOp) {
			console.log(`[langfuse-custo-conversa] no-op: ${resultado.noOp}`);
			process.exit(0);
		}
		if (!resultado.ok) {
			console.error(`[langfuse-custo-conversa] FALHOU:`);
			for (const falha of resultado.falhas) console.error(`  ${falha}`);
			process.exit(1);
		}
		console.log(
			`custo_conversa: ${resultado.pontuadas.length} session(s) pontuadas na janela de ${dias} dia(s) (upsert idempotente)`,
		);
		for (const linha of resultado.pontuadas) {
			console.log(`  ${linha.sessionId} → $${linha.custo.toFixed(6)}`);
		}
		process.exit(0);
	})();
}
