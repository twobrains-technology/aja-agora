// SCORE CONFIGS NO LANGFUSE — bloco B7 do plano
// `docs/design/planos/2026-11-05-langfuse-suíte.md`.
//
// Padroniza os scores na instância via `POST /api/public/score-configs`:
// - BOOLEAN: `numero_fora_da_cota`, `promessa_sem_fato`, `afirmacao_comparativa_falsa`,
//   `conducao_entregue`, `tool_recusou`;
// - NUMERIC: as 6 dimensões da rubrica (`src/lib/eval/rubric.ts` — 5 do juiz +
//   `conversao` do scorer, que também entra em `overallScore` em
//   `scorer-pipeline.ts`), cada uma 0..1;
// - NUMERIC: `custo_conversa` (por session, USD).
//
// Idempotente: `GET /api/public/score-configs` primeiro; cria só o que falta.
// Sem segredo em arquivo versionado: credenciais do ambiente, depois do cofre
// (`secrets.sh get-key pi-agentes-aja-langfuse <CHAVE>`), mesmo mecanismo do
// `scripts/langfuse-smoke.ts`. Nada aqui imprime chave.
//
// GATE: `pnpm tsx scripts/langfuse-score-configs.ts` → 200 para cada config;
// re-run idempotente (segunda execução não cria nada).

import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

const COFRE = "pi-agentes-aja-langfuse";

type Credenciais = { baseUrl: string; publicKey: string; secretKey: string };

type ScoreConfigType = "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT";

type Config = {
	name: string;
	dataType: ScoreConfigType;
	minValue?: number;
	maxValue?: number;
	description: string;
};

/** As 6 dimensões do juiz/scorer: 5 do juiz (`rubric.ts`, `types.ts`) +
 *  `conversao` do scorer (`scorer-pipeline.ts`), todas na média `overallScore`. */
const DIMENSOES: Array<{ nome: string; descricao: string }> = [
	{
		nome: "judge_engajamento",
		descricao:
			"Dimensão da rubrica (juiz offline): engajamento do lead — responde, fornece dados, segue a conversa. 0 a 1.",
	},
	{
		nome: "judge_discovery",
		descricao:
			"Dimensão da rubrica (juiz offline): descoberta — crédito, prazo e objetivo coletados antes de buscar grupos. 0 a 1.",
	},
	{
		nome: "judge_continuidade",
		descricao:
			"Dimensão da rubrica (juiz offline): continuidade — o vendedor referencia e amarra o que foi dito antes. 0 a 1.",
	},
	{
		nome: "judge_naturalidade",
		descricao:
			"Dimensão da rubrica (juiz offline): naturalidade — tom de vendedor humano, sem jargão nem respostas robóticas. 0 a 1.",
	},
	{
		nome: "judge_assertividade",
		descricao:
			"Dimensão da rubrica (juiz offline): assertividade — números e fatos ancorados em resultado de ferramenta, sem invenção. 0 a 1.",
	},
	{
		nome: "judge_conversao",
		descricao:
			"Dimensão da rubrica (scorer, determinística): conversão — avanço real da contratação (proposta gerada, desfecho). 0 a 1.",
	},
];

/** O catálogo inteiro. Nomes de dimensão têm prefixo `judge_` — na API
 *  `maxItems`/limite de nome, e para separar opinião de juiz (nunca gate) de
 *  sinal determinístico. */
const CONFIGS: Config[] = [
	{
		name: "numero_fora_da_cota",
		dataType: "BOOLEAN",
		description:
			"Sinal determinístico: valor dito pelo vendedor não bate com o que a cota/carta mostra (parcela, prazo, custo total). Fato de servidor.",
	},
	{
		name: "promessa_sem_fato",
		dataType: "BOOLEAN",
		description:
			"Sinal determinístico: promessa sem lastro em ferramenta (ex.: grupo novo/em andamento sem o dado da busca).",
	},
	{
		name: "afirmacao_comparativa_falsa",
		dataType: "BOOLEAN",
		description:
			'Sinal determinístico: a fala afirma superlativo/comparativo ("a menor taxa", "o mais curto", "o melhor") que o conjunto devolvido pelas tools desmente — outra opção do conjunto tem valor melhor. Fato de servidor.',
	},
	{
		name: "conducao_entregue",
		dataType: "BOOLEAN",
		description:
			"Sinal determinístico: a resposta deixa próximo passo — a conversa não morreu (premissa P0).",
	},
	{
		name: "tool_recusou",
		dataType: "BOOLEAN",
		description:
			"Sinal determinístico: ferramenta recusou a chamada no turno (parâmetro, permissão ou erro de uso).",
	},
	...DIMENSOES.map((d) => ({
		name: d.nome,
		dataType: "NUMERIC" as const,
		minValue: 0,
		maxValue: 1,
		description: d.descricao,
	})),
	{
		name: "custo_conversa",
		dataType: "NUMERIC",
		description:
			"Custo de IA da conversa em USD (score por session). Fonte: custo registrado pelo livro-caixa do eval (`judge.ts`), sem conversa não é custo de conversa.",
	},
];

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

type ScoreConfigResposta = { id: string; name: string; dataType: string };

type RespostaScoreConfigs = {
	data?: Array<ScoreConfigResposta>;
	meta?: { page?: number; totalPages?: number };
};

function autorizacao(cred: Credenciais): string {
	return "Basic " + Buffer.from(`${cred.publicKey}:${cred.secretKey}`).toString("base64");
}

export async function listarScoreConfigs(
	fetchFn: typeof fetch,
	cred: Credenciais,
): Promise<ScoreConfigResposta[]> {
	const existentes: ScoreConfigResposta[] = [];
	let page = 1;
	// Paginação: a lista pode vir partida; percorre até não haver próxima página.
	for (;;) {
		const resposta = await fetchFn(
			`${cred.baseUrl.replace(/\/$/, "")}/api/public/score-configs?page=${page}&limit=50`,
			{
				headers: { Authorization: autorizacao(cred) },
				signal: AbortSignal.timeout(15_000),
			},
		);
		if (!resposta.ok) {
			throw new Error(`GET /api/public/score-configs (página ${page}) → HTTP ${resposta.status}`);
		}
		const corpo = (await resposta.json()) as RespostaScoreConfigs;
		existentes.push(...(corpo.data ?? []));
		const total = corpo.meta?.totalPages ?? 1;
		if (page >= total) return existentes;
		page += 1;
	}
}

export async function criarScoreConfig(
	fetchFn: typeof fetch,
	cred: Credenciais,
	config: Config,
): Promise<{ status: number; criado: boolean }> {
	const resposta = await fetchFn(`${cred.baseUrl.replace(/\/$/, "")}/api/public/score-configs`, {
		method: "POST",
		headers: { Authorization: autorizacao(cred), "Content-Type": "application/json" },
		body: JSON.stringify({
			name: config.name,
			dataType: config.dataType,
			...(config.dataType === "NUMERIC"
				? { minValue: config.minValue ?? 0, maxValue: config.maxValue ?? 1 }
				: {}),
			description: config.description,
		}),
		signal: AbortSignal.timeout(15_000),
	});
	return { status: resposta.status, criado: resposta.ok };
}

export type ResultadoExecucao = {
	ok: boolean;
	motivo?: string;
	criados: string[];
	existentes: string[];
};

export async function executar(
	env: Record<string, string | undefined> = process.env,
	lerCofre: (chave: string) => string | undefined = doCofre,
	fetchFn: typeof fetch = fetch,
): Promise<ResultadoExecucao> {
	const cred = credenciais(env, lerCofre);
	if (!cred) {
		return {
			ok: false,
			motivo: "sem credenciais no ambiente e no cofre — script não roda",
			criados: [],
			existentes: [],
		};
	}

	const existentes = await listarScoreConfigs(fetchFn, cred);
	const nomesExistentes = new Set(existentes.map((c) => c.name));

	const criados: string[] = [];
	const presentes: string[] = [];
	for (const config of CONFIGS) {
		if (nomesExistentes.has(config.name)) {
			presentes.push(config.name);
			continue;
		}
		const { status, criado } = await criarScoreConfig(fetchFn, cred, config);
		if (!criado) {
			return {
				ok: false,
				motivo: `POST /api/public/score-configs para ${config.name} → HTTP ${status}`,
				criados,
				existentes: presentes,
			};
		}
		criados.push(config.name);
	}
	return { ok: true, criados, existentes: presentes };
}

function ehProcessoPrincipal(): boolean {
	const alvo = process.argv[1];
	if (!alvo) return false;
	const alvoAbs = isAbsolute(alvo) ? alvo : resolve(alvo);
	return import.meta.url === `file://${alvoAbs}`;
}

if (ehProcessoPrincipal()) {
	void (async () => {
		const resultado = await executar();
		if (!resultado.ok) {
			console.error(
				`[langfuse-score-configs] FALHOU: ${resultado.motivo ?? "motivo desconhecido"}`,
			);
			console.error(`  criados antes da falha: ${resultado.criados.join(", ") || "nenhum"}`);
			process.exit(1);
		}
		console.log(
			`score-configs: ${resultado.criados.length} criados, ${resultado.existentes.length} já existiam (idempotente)`,
		);
		for (const nome of resultado.criados) console.log(`  criado   ${nome}`);
		for (const nome of resultado.existentes) console.log(`  existente ${nome}`);
		process.exit(0);
	})();
}
