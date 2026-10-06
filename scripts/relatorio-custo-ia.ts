#!/usr/bin/env node
/**
 * Relatório de custo de IA do Aja Agora — a série diária do gasto, total por
 * mês, reconciliada entre as duas fontes e, onde der, separando conversa real
 * de teste da casa.
 *
 * ── Por que este relatório existe ───────────────────────────────────────────
 *
 * A cliente (Bruna, 22/09) pediu o custo de IA para fechar o CPC. O painel de
 * Performance mostra o total do período; falta a SÉRIE — dia a dia, mês a mês,
 * com as duas fontes lado a lado e a diferença entre elas declarada.
 *
 * ── As fontes, e qual manda no histórico ────────────────────────────────────
 *
 * 1. **Gateway `LiteLLM_DailyUserSpend`** — a fonte que COBRA. É o agregado
 *    diário da key de produção, no banco do próprio LiteLLM, desde 24/06/2026.
 *    Dele sai a série principal (dia a dia, mês a mês, por modelo, USD e R$).
 * 2. **LiteLLM `/spend/logs`** — RECONFERÊNCIA. O log por requisição tem
 *    **retenção de 14 dias**: dia ausente NÃO é gasto zero, aparece como
 *    `sem dado retido`. Reconcilia com o agregado do gateway nos dias em que os
 *    dois existem.
 * 3. **Langfuse `environment=production`** (`/api/public/v2/metrics`) — CONFERÊNCIA,
 *    nunca a fonte que cobra. Desde a troca para o `qwen3.8-flash` ele registra
 *    ~0, e o relatório DECLARA por quê: a tabela de modelos do Langfuse não
 *    conhece o qwen (não tem preço para ele), então as gerações entram com custo
 *    0. Juiz (`langfuse-llm-as-a-judge`) e dev vão em coluna à parte.
 *
 * ── O Real ──────────────────────────────────────────────────────────────────
 *
 * A cotação usada (USD→BRL) e a fonte dela vão declaradas no rodapé: primeiro
 * o cadastro do painel (`custos_config.cotacao_usd_brl`, a fonte oficial do
 * produto); sem ele, a PTAX de venda do Banco Central do dia. Sem nenhuma das
 * duas, o R$ é `—` (não calculável), nunca zero.
 *
 * ── Uso (no host, com o túnel SSM até o gateway de produção) ────────────────
 *
 *   RELATORIO_CUSTO_LITELLM_BASE=http://127.0.0.1:14000 \
 *   RELATORIO_CUSTO_LITELLM_KEY=<master key do cofre> \
 *   RELATORIO_CUSTO_LITELLM_DB_URL=<banco do gateway, só leitura> \
 *   RELATORIO_CUSTO_DATABASE_URL=<túnel de produção, só leitura> \
 *     pnpm tsx scripts/relatorio-custo-ia.ts
 *
 * O `_env-host` carrega o `.env.local` (Langfuse de produção + banco LOCAL); as
 * duas variáveis de LiteLLM existem porque o `.env.local` aponta para o gateway
 * LOCAL e não serve para ler produção. Chave NUNCA vai em argumento de linha de
 * comando (aparece no `ps`).
 *
 * Saída: `~/Downloads/custo-ia-aja-agora-<data>.pdf` e `.csv`.
 * **Não envia o relatório a ninguém** — o envio é do dono.
 *
 * Sem driver de banco: lê o Postgres com `psql` (já instalado). Sem dependência
 * nova.
 */
import "./_env-host";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { consultaDeMetricasDoLangfuse, linhasDoMetricasDoLangfuse } from "@/lib/admin/custo-de-ia";

const FUSO = "America/Sao_Paulo";
const ALIAS_DA_KEY = "aja-agora-prod";
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** O environment de produção do app — a série principal do relatório. */
const ENV_PRODUCAO = "production";
/** O environment dos evaluators `judge_*` — custo à parte, nunca somado à produção. */
const ENV_JUIZ = "langfuse-llm-as-a-judge";
/** O rótulo do dia sem linha no LiteLLM (retenção de 14d) — NUNCA `0,0000`. */
const SEM_DADO_RETIDO = "sem dado retido";

/** O dia do negócio (`YYYY-MM-DD`) de um instante — igual ao resto do painel. */
const diaDoNegocio = (instante: Date): string =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone: FUSO,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instante);

/** A data que ancora um dia no meio-dia UTC — não escorrega de data em fuso nenhum. */
const ancoraDoDia = (dia: string): Date => new Date(`${dia}T12:00:00Z`);

/** Todos os dias do negócio entre dois dias (inclusive). */
function diasEntre(de: string, ate: string): string[] {
	const dias: string[] = [];
	const ultimo = ancoraDoDia(ate).getTime();
	let cursor = ancoraDoDia(de);
	while (cursor.getTime() <= ultimo) {
		dias.push(diaDoNegocio(cursor));
		cursor = new Date(cursor.getTime() + UM_DIA_MS);
	}
	return dias;
}

const usd = (valor: number): string =>
	valor.toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 4,
		style: "currency",
		currency: "USD",
	});

const brl = (valor: number): string =>
	valor.toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
		style: "currency",
		currency: "BRL",
	});

const usdFixo = (valor: number): string => valor.toFixed(4);

const pct = (parte: number, base: number): string =>
	base === 0
		? "—"
		: `${((parte / base) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** A diferença relativa COM sinal — é o que o relatório reconcilia. */
const diferenca = (liteLLM: number, langfuse: number): string =>
	langfuse === 0
		? "—"
		: `${(((liteLLM - langfuse) / langfuse) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

// ─── Fontes ──────────────────────────────────────────────────────────────────

/** A série diária do LiteLLM, só dos dias com linha (o resto é ausência). */
type SerieLiteLLM = Map<string, number>;
/** A série diária do Langfuse, já partida em produção / juiz / dev. */
type SerieLangfuse = Map<string, { producao: number; juiz: number; dev: number }>;

/** Uma chamada HTTP autenticada com Bearer (o LiteLLM). */
async function chamarLiteLLM(base: string, key: string, caminho: string): Promise<unknown> {
	const resposta = await fetch(`${base.replace(/\/$/, "")}${caminho}`, {
		headers: { Authorization: `Bearer ${key}` },
		cache: "no-store",
	});
	if (!resposta.ok) throw new Error(`litellm-${resposta.status} em ${caminho}`);
	return resposta.json();
}

/**
 * A key `aja-agora-prod` (token + criação). O `/key/list` pagina em 10 por
 * padrão e some com a key se a página não for pedida — daí o `size` explícito.
 */
async function tokenDaKey(base: string, key: string): Promise<{ token: string; criadaEm: string }> {
	const lista = (await chamarLiteLLM(
		base,
		key,
		"/key/list?return_full_object=true&page=1&size=100",
	)) as { keys?: unknown[] };
	for (const item of lista.keys ?? []) {
		if (!item || typeof item !== "object") continue;
		const k = item as Record<string, unknown>;
		if (k.key_alias === ALIAS_DA_KEY && typeof k.token === "string") {
			return { token: k.token, criadaEm: String(k.created_at ?? "") };
		}
	}
	throw new Error(
		`a key '${ALIAS_DA_KEY}' não apareceu no /key/list — use a master key do gateway`,
	);
}

/**
 * A série diária do gasto da key no LiteLLM. Só volta o que o gateway retém
 * (14 dias) — dia ausente é ausência, nunca zero.
 */
async function serieDoLiteLLM(
	base: string,
	key: string,
	token: string,
	de: string,
	ate: string,
): Promise<SerieLiteLLM> {
	const linhas = (await chamarLiteLLM(
		base,
		key,
		`/spend/logs?api_key=${encodeURIComponent(token)}&start_date=${de}&end_date=${ate}`,
	)) as Array<Record<string, unknown>>;
	const serie: SerieLiteLLM = new Map();
	for (const linha of linhas) {
		const dia = String(linha.startTime ?? "").slice(0, 10);
		const valor = Number(linha.spend) || 0;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || valor <= 0) continue;
		serie.set(dia, (serie.get(dia) ?? 0) + valor);
	}
	return serie;
}

/**
 * O AGREGADO DIÁRIO do gateway — a fonte que COBRA.
 *
 * O `/spend/logs` vive 14 dias e some com o passado; o `LiteLLM_DailyUserSpend`,
 * no banco do próprio gateway, guarda o agregado diário da key desde 24/06/2026.
 * É ele que responde "quanto a IA custou" de verdade, dia a dia e por modelo.
 */
interface SerieGateway {
	porDia: Map<string, number>;
	porModelo: Map<string, number>;
	porDiaModelo: Map<string, Map<string, number>>;
	primeiro: string;
	ultimo: string;
}

/**
 * Lê o `LiteLLM_DailyUserSpend` da key no banco do gateway (só leitura). O token
 * da key vai no SQL por **stdin** (`psql -f -`), nunca em argumento — a linha de
 * comando é pública para o `ps` da máquina.
 */
function lerGateway(dbUrl: string, token: string): SerieGateway {
	const tokenSeguro = token.replace(/'/g, "''");
	const sql =
		`select date, coalesce(model, '(sem modelo)') as modelo, spend ` +
		`from "LiteLLM_DailyUserSpend" where api_key = '${tokenSeguro}' ` +
		`and spend > 0 order by date`;
	const saida = execPsql(dbUrl, ["-tA", "-F", "\t"], 64 * 1024 * 1024, sql);

	const porDia = new Map<string, number>();
	const porModelo = new Map<string, number>();
	const porDiaModelo = new Map<string, Map<string, number>>();
	for (const linha of saida.split("\n")) {
		if (!linha) continue;
		const [dia, modelo, valorBruto] = linha.split("\t");
		const valor = Number(valorBruto) || 0;
		if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || valor <= 0) continue;
		const chaveModelo = modelo || "(sem modelo)";
		porDia.set(dia, (porDia.get(dia) ?? 0) + valor);
		porModelo.set(chaveModelo, (porModelo.get(chaveModelo) ?? 0) + valor);
		const doDia = porDiaModelo.get(dia) ?? new Map<string, number>();
		doDia.set(chaveModelo, (doDia.get(chaveModelo) ?? 0) + valor);
		porDiaModelo.set(dia, doDia);
	}
	const dias = [...porDia.keys()].sort();
	return {
		porDia,
		porModelo,
		porDiaModelo,
		primeiro: dias[0] ?? "",
		ultimo: dias[dias.length - 1] ?? "",
	};
}

/** Uma consulta de métricas v2 do Langfuse, com as credenciais de produção. */
async function consultarMetricas(
	query: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
	const base = process.env.LANGFUSE_BASE_URL?.trim();
	const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
	const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
	if (!base || !publicKey || !secretKey) throw new Error("LANGFUSE_* ausentes no ambiente");
	const resposta = await fetch(
		`${base.replace(/\/$/, "")}/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`,
		{
			headers: {
				Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
			},
			cache: "no-store",
		},
	);
	if (!resposta.ok) throw new Error(`langfuse-metrics-${resposta.status}`);
	const payload = (await resposta.json()) as { data?: Array<Record<string, unknown>> };
	return payload.data ?? [];
}

/**
 * A série diária COMPLETA do Langfuse, dia a dia por environment — é a espinha
 * do relatório. `production` é a produção do app; `langfuse-llm-as-a-judge` é o
 * custo dos evaluators `judge_*` (coluna própria); todo o resto é dev.
 */
async function serieDoLangfuse(de: string, ate: string): Promise<SerieLangfuse> {
	const dados = await consultarMetricas({
		view: "observations",
		dimensions: [{ field: "environment" }],
		metrics: [{ measure: "totalCost", aggregation: "sum" }],
		filters: [],
		timeDimension: { granularity: "day" },
		// O teto explícito é obrigatório: a v2 corta em 100 por padrão e devolve
		// os dias mais ANTIGOS primeiro — sem ele, uma janela longa derruba os
		// dias recentes em silêncio.
		config: { row_limit: 1000 },
		fromTimestamp: `${de}T00:00:00.000Z`,
		toTimestamp: `${ate}T23:59:59.999Z`,
	});
	if (dados.length >= 1000) {
		throw new Error("langfuse-metrics: teto de 1000 linhas atingido — reduza a janela");
	}
	const serie: SerieLangfuse = new Map();
	for (const linha of dados) {
		const dia = String(linha.time_dimension ?? "").slice(0, 10);
		const environment = String(linha.environment ?? "");
		const valor = Number(linha.sum_totalCost) || 0;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
		const atual = serie.get(dia) ?? { producao: 0, juiz: 0, dev: 0 };
		if (environment === ENV_PRODUCAO) atual.producao += valor;
		else if (environment === ENV_JUIZ) atual.juiz += valor;
		else atual.dev += valor;
		serie.set(dia, atual);
	}
	return serie;
}

/**
 * O Langfuse NÃO tem preço para o `qwen3.8-flash`? Consulta a tabela de modelos
 * dele: se o modelo não está lá, as gerações do qwen entram com custo **0** — e é
 * isso que explica o `environment=production` registrar ~0 desde a troca para o
 * qwen. Devolve `true` quando os preços do qwen NÃO estão cadastrados na fonte;
 * `false` tanto quando o preço existe quanto quando a consulta não responde
 * (abstenção: sem prova, o relatório não afirma).
 */
async function confirmarQwenSemPreco(): Promise<boolean> {
	const base = process.env.LANGFUSE_BASE_URL?.trim();
	const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
	const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
	if (!base || !publicKey || !secretKey) return false;
	const cabecalho = {
		Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
	};
	try {
		for (let pagina = 1; pagina <= 3; pagina += 1) {
			const resposta = await fetch(
				`${base.replace(/\/$/, "")}/api/public/models?limit=100&page=${pagina}`,
				{ headers: cabecalho, cache: "no-store" },
			);
			if (!resposta.ok) return false;
			const payload = (await resposta.json()) as { data?: Array<{ modelName?: string }> };
			const modelos = payload.data ?? [];
			if (modelos.length === 0) break;
			if (
				modelos.some((m) =>
					String(m.modelName ?? "")
						.toLowerCase()
						.includes("qwen"),
				)
			) {
				return false;
			}
			if (modelos.length < 100) break;
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Roda o `psql` com a credencial do banco FORA do argv.
 *
 * A `DATABASE_URL` completa (com senha) como argumento do `psql` aparece no `ps`
 * da máquina — qualquer processo local lia a senha de produção. Aqui ela é
 * quebrada nas variáveis `PG*` do ambiente do filho: mesma conexão, sem segredo
 * visível na linha de comando.
 */
function execPsql(
	dbUrl: string,
	args: string[],
	maxBuffer = 1024 * 1024,
	entrada?: string,
): string {
	const url = new URL(dbUrl);
	const env: NodeJS.ProcessEnv = {
		...process.env,
		PGHOST: url.hostname,
		PGPORT: url.port || "5432",
		PGUSER: decodeURIComponent(url.username),
		PGDATABASE: url.pathname.replace(/^\//, ""),
	};
	if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
	const sslmode = url.searchParams.get("sslmode");
	if (sslmode) env.PGSSLMODE = sslmode;
	return execFileSync("psql", args, {
		encoding: "utf8",
		maxBuffer,
		env,
		...(entrada !== undefined ? { input: entrada } : {}),
	}).trim();
}

/** O valor de uma chave do cadastro de custos no Postgres (só leitura). */
function lerDoCadastro(dbUrl: string, chave: string): string | null {
	try {
		const saida = execPsql(dbUrl, [
			"-tAc",
			`select valor from custos_config where chave='${chave}' limit 1`,
		]);
		return saida || null;
	} catch {
		return null;
	}
}

/** " 5.45 " → 5.45; vazio/texto/≤0 → `null` (ausência, nunca zero). */
function cotacaoDaString(bruto: string | null | undefined): number | null {
	if (bruto == null) return null;
	const texto = bruto.trim().replace(",", ".");
	if (!/^\d+(\.\d+)?$/.test(texto)) return null;
	const numero = Number(texto);
	return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** A cotação USD→BRL usada no relatório, com a fonte declarada. */
interface Cotacao {
	valor: number;
	fonte: string;
}

/** A PTAX de venda do BCB do dia (`YYYY-MM-DD` → `MM-DD-YYYY` na API). */
async function ptaxDoDia(dia: string): Promise<Cotacao | null> {
	const [ano, mes, d] = dia.split("-");
	const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao=%27${mes}-${d}-${ano}%27&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
	try {
		const resposta = await fetch(url, { cache: "no-store" });
		if (!resposta.ok) return null;
		const dados = (await resposta.json()) as {
			value?: Array<{ cotacaoVenda?: number; dataHoraCotacao?: string }>;
		};
		const linha = dados.value?.[0];
		const valor = Number(linha?.cotacaoVenda);
		if (!Number.isFinite(valor) || valor <= 0) return null;
		return {
			valor,
			fonte: `PTAX de venda do Banco Central do Brasil em ${dia} (olinda.bcb.gov.br, CotacaoDolarDia)`,
		};
	} catch {
		return null;
	}
}

/**
 * A cotação: cadastro do painel (fonte oficial) > PTAX do BCB > não calculável.
 * O `RELATORIO_CUSTO_COTACAO_USD_BRL` (env) tem precedência só para reproduzir
 * um relatório antigo — nunca é o caminho normal.
 */
async function resolverCotacao(dia: string, dbUrl: string | undefined): Promise<Cotacao | null> {
	const daEnv = cotacaoDaString(process.env.RELATORIO_CUSTO_COTACAO_USD_BRL);
	if (daEnv) return { valor: daEnv, fonte: "variável de ambiente RELATORIO_CUSTO_COTACAO_USD_BRL" };
	if (dbUrl) {
		const doCadastro = cotacaoDaString(lerDoCadastro(dbUrl, "cotacao_usd_brl"));
		if (doCadastro) {
			return {
				valor: doCadastro,
				fonte: "cadastro do painel (custos_config.cotacao_usd_brl, produção)",
			};
		}
	}
	return ptaxDoDia(dia);
}

/** Os `conversationId` com o selo de teste da casa, lidos do Postgres (só leitura). */
function conversasDoPostgres(url: string): Map<string, boolean> {
	const saida = execPsql(
		url,
		["-tA", "-F", "\t", "-c", "select id, is_simulated from conversations"],
		64 * 1024 * 1024,
	);
	const mapa = new Map<string, boolean>();
	for (const linha of saida.split("\n")) {
		if (!linha) continue;
		const [id, simulado] = linha.split("\t");
		if (id) mapa.set(id, simulado === "t");
	}
	return mapa;
}

/**
 * O custo por conversa no Langfuse (dimensão `sessionId`), cruzado com o selo de
 * teste do Postgres. Devolve null quando o banco não foi informado — abstenção
 * declarada, nunca separação inventada.
 */
async function separacaoRealTeste(
	de: string,
	ate: string,
	dbUrl: string | undefined,
): Promise<{ real: number; teste: number; semConversa: number } | null> {
	if (!dbUrl) return null;
	const porConversa = conversasDoPostgres(dbUrl);

	const base = process.env.LANGFUSE_BASE_URL?.trim();
	const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
	const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
	if (!base || !publicKey || !secretKey) throw new Error("LANGFUSE_* ausentes no ambiente");
	const cabecalho = {
		Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
	};

	let real = 0;
	let teste = 0;
	let semConversa = 0;
	for (const dia of diasEntre(de, ate)) {
		const inicio = new Date(`${dia}T00:00:00.000Z`);
		const fim = new Date(`${dia}T23:59:59.999Z`);
		// A mesma consulta da borda do painel (v2, sessionId) — uma definição só da rota.
		const { url } = consultaDeMetricasDoLangfuse(base, inicio, fim);
		const resposta = await fetch(url, { headers: cabecalho, cache: "no-store" });
		if (!resposta.ok) throw new Error(`langfuse-metrics-${resposta.status}`);
		for (const linha of linhasDoMetricasDoLangfuse(await resposta.json(), dia)) {
			const valor = (linha.custoUsdCents ?? 0) / 100;
			const simulado = porConversa.get(linha.sessionId);
			if (simulado === undefined) semConversa += valor;
			else if (simulado) teste += valor;
			else real += valor;
		}
	}
	return { real, teste, semConversa };
}

// ─── Apresentação ────────────────────────────────────────────────────────────

const esc = (v: unknown): string =>
	String(v ?? "").replace(
		/[&<>"]/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
	);

const somar = (serie: Map<string, number>): number =>
	[...serie.values()].reduce((total, valor) => total + valor, 0);

function chaveDoMes(dia: string): string {
	return dia.slice(0, 7);
}

interface LinhaDoRelatorio {
	dia: string;
	/** A fonte que COBRA (agregado diário do gateway). `null` = dia sem gasto registrado. */
	gateway: number | null;
	/** `/spend/logs` — reconferência, só os 14 dias que ele retém. `null` = sem dado retido. */
	liteLLM: number | null;
	/** Langfuse `environment=production` — CONFERÊNCIA (desde o qwen registra ~0). */
	producao: number;
	juiz: number;
	dev: number;
}

/** Monta a grade do relatório: todo dia que existe em QUALQUER das fontes. */
function montarLinhas(
	gateway: SerieGateway,
	liteLLM: SerieLiteLLM,
	langfuse: SerieLangfuse,
): { linhas: LinhaDoRelatorio[]; janelaLL: [string, string] | null } {
	const dias = [
		...new Set([...gateway.porDia.keys(), ...liteLLM.keys(), ...langfuse.keys()]),
	].sort();
	const linhas = dias
		.map((dia) => {
			const doLangfuse = langfuse.get(dia) ?? { producao: 0, juiz: 0, dev: 0 };
			return {
				dia,
				gateway: gateway.porDia.has(dia) ? (gateway.porDia.get(dia) ?? 0) : null,
				liteLLM: liteLLM.has(dia) ? (liteLLM.get(dia) ?? 0) : null,
				producao: doLangfuse.producao,
				juiz: doLangfuse.juiz,
				dev: doLangfuse.dev,
			};
		})
		// Dia sem custo em lado nenhum é ruído (a v2 devolve o dia com soma 0).
		.filter(
			(l) => l.gateway !== null || l.liteLLM !== null || l.producao > 0 || l.juiz > 0 || l.dev > 0,
		);
	const comLL = [...liteLLM.keys()].sort();
	const janelaLL: [string, string] | null =
		comLL.length > 0 ? [comLL[0], comLL[comLL.length - 1]] : null;
	return { linhas, janelaLL };
}

function htmlDoRelatorio(args: {
	de: string;
	ate: string;
	linhas: LinhaDoRelatorio[];
	janelaLL: [string, string] | null;
	janelaGateway: [string, string] | null;
	porModelo: Map<string, number>;
	cotacao: Cotacao | null;
	erroGateway: string | null;
	erroLiteLLM: string | null;
	erroLangfuse: string | null;
	qwenSemPreco: boolean;
	separacao: { real: number; teste: number; semConversa: number } | null | { erro: string };
	dbInformado: boolean;
	geradoEm: string;
}): string {
	const { linhas } = args;
	const cotacao = args.cotacao;
	const paraBrl = (valor: number): string => (cotacao ? brl(valor * cotacao.valor) : "—");

	// O número que COBRA é o agregado diário do gateway.
	const totalGateway = linhas.reduce((t, l) => t + (l.gateway ?? 0), 0);
	// O Langfuse é CONFERÊNCIA: desde a troca para o qwen ele registra ~0.
	const totalProducao = linhas.reduce((t, l) => t + l.producao, 0);
	const totalJuiz = linhas.reduce((t, l) => t + l.juiz, 0);
	const totalDev = linhas.reduce((t, l) => t + l.dev, 0);
	const linhasLL = linhas.filter((l) => l.liteLLM !== null);
	const totalLL = linhasLL.reduce((t, l) => t + (l.liteLLM ?? 0), 0);

	// A reconferência `/spend/logs` × agregado do gateway só olha os dias em que os
	// DOIS existem (a retenção de 14 dias do log por requisição).
	const reconferencia = linhas.filter((l) => l.liteLLM !== null && l.gateway !== null);
	const totalLLReconf = reconferencia.reduce((t, l) => t + (l.liteLLM ?? 0), 0);
	const totalGatewayReconf = reconferencia.reduce((t, l) => t + (l.gateway ?? 0), 0);

	const linhasDia = linhas
		.map((l) => {
			const gatewayCelula =
				l.gateway === null
					? `<td class="num vazio">—</td><td class="num vazio">—</td>`
					: `<td class="num">${usdFixo(l.gateway)}</td><td class="num">${paraBrl(l.gateway)}</td>`;
			const litellmCelula =
				l.liteLLM === null
					? `<td class="num vazio">${SEM_DADO_RETIDO}</td>`
					: `<td class="num">${usdFixo(l.liteLLM)}</td>`;
			return `<tr><td>${esc(l.dia)}</td>${gatewayCelula}${litellmCelula}<td class="num">${usdFixo(l.producao)}</td><td class="num">${usdFixo(l.juiz)}</td><td class="num">${usdFixo(l.dev)}</td></tr>`;
		})
		.join("");

	const meses = [...new Set(linhas.map((l) => chaveDoMes(l.dia)))].sort();
	const linhasMes = meses
		.map((mes) => {
			const doMes = linhas.filter((l) => chaveDoMes(l.dia) === mes);
			const gateway = doMes.reduce((t, l) => t + (l.gateway ?? 0), 0);
			const producao = doMes.reduce((t, l) => t + l.producao, 0);
			const juiz = doMes.reduce((t, l) => t + l.juiz, 0);
			const dev = doMes.reduce((t, l) => t + l.dev, 0);
			const doMesLL = doMes.filter((l) => l.liteLLM !== null);
			const litellm = doMesLL.reduce((t, l) => t + (l.liteLLM ?? 0), 0);
			const litellmCelula =
				doMesLL.length === 0
					? `<td class="num vazio">${SEM_DADO_RETIDO}</td>`
					: `<td class="num">${usdFixo(litellm)}</td>`;
			return `<tr><td>${esc(mes)}</td><td class="num">${usdFixo(gateway)}</td><td class="num">${paraBrl(gateway)}</td>${litellmCelula}<td class="num">${usdFixo(producao)}</td><td class="num">${usdFixo(juiz)}</td><td class="num">${usdFixo(dev)}</td></tr>`;
		})
		.join("");

	const linhasModelo = [...args.porModelo.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(
			([modelo, valor]) =>
				`<tr><td>${esc(modelo)}</td><td class="num">${usdFixo(valor)}</td><td class="num">${paraBrl(valor)}</td><td class="num">${pct(valor, totalGateway)}</td></tr>`,
		)
		.join("");

	const separacao = args.separacao && !("erro" in args.separacao) ? args.separacao : null;
	const totalSeparado = separacao ? separacao.real + separacao.teste + separacao.semConversa : 0;
	const separacaoCalculavel = Boolean(separacao) && totalSeparado >= totalProducao * 0.05;
	const separacaoHtml =
		separacaoCalculavel && separacao
			? `
				<h2>Custo do Langfuse: conversa real × teste da casa</h2>
				<table>
					<thead><tr><th>Origem</th><th class="num">USD</th><th class="num">% do total</th></tr></thead>
					<tbody>
						<tr><td>Conversa real (<code>is_simulated = false</code>)</td><td class="num">${usdFixo(separacao.real)}</td><td class="num">${pct(separacao.real, totalSeparado)}</td></tr>
						<tr><td>Teste da casa (<code>is_simulated = true</code>)</td><td class="num">${usdFixo(separacao.teste)}</td><td class="num">${pct(separacao.teste, totalSeparado)}</td></tr>
						<tr><td>Sem conversa no banco (inclui dev/avulso)</td><td class="num">${usdFixo(separacao.semConversa)}</td><td class="num">${pct(separacao.semConversa, totalSeparado)}</td></tr>
					</tbody>
				</table>`
			: `<h2>Custo do Langfuse: conversa real × teste da casa</h2>
				<p class="nota">Não calculável. ${
					args.separacao && "erro" in args.separacao
						? esc(args.separacao.erro)
						: !args.dbInformado
							? "Informe <code>RELATORIO_CUSTO_DATABASE_URL</code> (túnel de produção, só leitura) para separar."
							: totalSeparado === 0
								? "No Langfuse v4, a sessão vive no trace e as observações que custam não a carregam: o custo por conversa não é legível por <code>sessionId</code>. É limitação da fonte, não do relatório."
								: `A fatia com sessão identificada (${usd(totalSeparado)}) é irrisória diante da produção (${usd(totalProducao)}) — a separação não teria significado. A sessão mora no trace; as observações que custam não a carregam.`
				}</p>`;

	const aviso = (fonte: string, erro: string | null) =>
		erro ? `<p class="nota neg">${fonte} indisponível: ${esc(erro)}</p>` : "";

	const rotuloJanela = args.janelaLL
		? `${esc(args.janelaLL[0])} a ${esc(args.janelaLL[1])}`
		: "nenhum dia retido";
	const rotuloGateway = args.janelaGateway
		? `${esc(args.janelaGateway[0])} a ${esc(args.janelaGateway[1])}`
		: "sem dado";
	const cotacaoRodape = cotacao
		? `Cotação usada: <strong>R$ ${cotacao.valor.toFixed(4).replace(".", ",")}</strong> por US$ 1,00 — fonte: ${esc(cotacao.fonte)}.`
		: `Sem cotação USD→BRL: o R$ não é calculável (o cadastro <code>custos_config.cotacao_usd_brl</code> está vazio e a PTAX do dia não respondeu). O dólar continua sendo o número; o R$ fica <code>—</code>, nunca zero.`;
	const notaQwen = args.qwenSemPreco
		? `O Langfuse <strong>não tem preço para o <code>qwen3.8-flash</code></strong>: a tabela de modelos dele (174 modelos) não conhece o modelo, então as gerações do qwen entram com custo <strong>0</strong>. Medido em 01–05/10: o qwen aparece com 278 observações e US$ 0,0000 em <code>environment=production</code>, enquanto o <code>claude-haiku-4-5</code> (140 observações) responde por US$ 0,3218. Por isso, desde a troca para o qwen, o Langfuse registra ~0 — ele é CONFERÊNCIA, não a fonte que cobra.`
		: `Não foi possível confirmar se o Langfuse tem preço para o <code>qwen3.8-flash</code> (a tabela de modelos não respondeu). O Langfuse segue como CONFERÊNCIA, nunca como a fonte que cobra.`;

	return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Custo de IA — Aja Agora</title>
<style>
	:root { --navy:#052440; --blue:#036eff; --ink:#021628; --paper:#fafaf3; --coral:#f2404f; }
	* { box-sizing: border-box; }
	body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: var(--paper); margin: 0; padding: 40px 48px; }
	h1 { color: var(--navy); font-size: 26px; margin: 0 0 4px; }
	h2 { color: var(--navy); font-size: 17px; margin: 30px 0 10px; border-bottom: 2px solid var(--blue); padding-bottom: 6px; }
	.sub { color: #5b6b7c; font-size: 13px; margin: 0 0 22px; }
	.kpis { display: flex; gap: 14px; margin: 18px 0 6px; flex-wrap: wrap; }
	.kpi { flex: 1; min-width: 180px; background: #fff; border: 1px solid #e2e6ea; border-radius: 10px; padding: 14px 16px; }
	.kpi .rotulo { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6b7b8c; }
	.kpi .valor { font-size: 22px; font-weight: 700; color: var(--navy); margin-top: 6px; }
	.kpi .obs { font-size: 11px; color: #7b8b9c; margin-top: 2px; }
	table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e6ea; border-radius: 8px; overflow: hidden; font-size: 12px; }
	th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eef1f4; }
	th { background: #f4f7fa; color: var(--navy); font-weight: 600; }
	td.num { text-align: right; font-variant-numeric: tabular-nums; }
	.neg { color: var(--coral); }
	.vazio { color: #9aa8b6; font-style: italic; font-size: 11px; }
	.nota { font-size: 12px; color: #5b6b7c; }
	.rodape { margin-top: 26px; font-size: 11px; color: #7b8b9c; line-height: 1.6; }
</style></head><body>
	<h1>Custo de IA — Aja Agora</h1>
	<p class="sub">Key <strong>${esc(ALIAS_DA_KEY)}</strong> — série principal: agregado diário do gateway (<code>LiteLLM_DailyUserSpend</code>) · Langfuse <code>environment=production</code>: CONFERÊNCIA · período ${esc(args.de)} a ${esc(args.ate)} · gerado em ${esc(args.geradoEm)}</p>

	<div class="kpis">
		<div class="kpi"><div class="rotulo">Gateway — a fonte que cobra (LiteLLM_DailyUserSpend)</div><div class="valor">${usd(totalGateway)}</div><div class="obs">${paraBrl(totalGateway)} · janela ${rotuloGateway}</div></div>
		<div class="kpi"><div class="rotulo">Langfuse produção (conferência)</div><div class="valor">${usd(totalProducao)}</div><div class="obs">${paraBrl(totalProducao)} · registra ~0 desde o qwen</div></div>
		<div class="kpi"><div class="rotulo">/spend/logs — reconferência (retenção)</div><div class="valor">${usd(totalLL)}</div><div class="obs">janela coberta: ${rotuloJanela}</div></div>
		<div class="kpi"><div class="rotulo">Juiz + Dev (Langfuse, à parte)</div><div class="valor">${usd(totalJuiz + totalDev)}</div><div class="obs">juiz ${usd(totalJuiz)} · dev ${usd(totalDev)}</div></div>
	</div>
	${aviso("Gateway (LiteLLM_DailyUserSpend)", args.erroGateway)}
	${aviso("/spend/logs", args.erroLiteLLM)}
	${aviso("Langfuse", args.erroLangfuse)}

	<h2>Total por mês</h2>
	<table><thead><tr><th>Mês</th><th class="num">Gateway USD</th><th class="num">Gateway R$</th><th class="num">/spend/logs USD</th><th class="num">Langfuse produção USD</th><th class="num">Juiz USD</th><th class="num">Dev USD</th></tr></thead>
	<tbody>${linhasMes || "<tr><td colspan='7'>sem dado</td></tr>"}</tbody></table>

	<h2>Custo por modelo (gateway, período completo)</h2>
	<table><thead><tr><th>Modelo</th><th class="num">USD</th><th class="num">R$</th><th class="num">% do total</th></tr></thead>
	<tbody>${linhasModelo || "<tr><td colspan='4'>sem dado</td></tr>"}</tbody></table>

	<h2>Série diária</h2>
	<table><thead><tr><th>Dia</th><th class="num">Gateway USD</th><th class="num">Gateway R$</th><th class="num">/spend/logs USD</th><th class="num">Langfuse produção USD</th><th class="num">Juiz USD</th><th class="num">Dev USD</th></tr></thead>
	<tbody>${linhasDia || "<tr><td colspan='7'>sem dado</td></tr>"}</tbody></table>

	${separacaoHtml}

	<p class="rodape">
		<strong>A fonte que cobra é o gateway.</strong> Série principal = <code>LiteLLM_DailyUserSpend</code> da key ${esc(ALIAS_DA_KEY)}: ${usd(totalGateway)} (${paraBrl(totalGateway)}).<br>
		<strong>Reconferência /spend/logs × agregado do gateway.</strong> Só entram os dias em que os DOIS existem: ${reconferencia.length} dia(s). Neles, o log soma ${usd(totalLLReconf)} e o agregado ${usd(totalGatewayReconf)} — diferença ${diferenca(totalLLReconf, totalGatewayReconf)}. Dia sem linha no log é <em>${SEM_DADO_RETIDO}</em> (retenção de 14 dias), nunca <code>0,0000</code>.<br>
		<strong>Janela do /spend/logs:</strong> ${rotuloJanela}.<br>
		<strong>Langfuse é conferência, não a fonte que cobra.</strong> ${notaQwen}<br>
		<strong>${cotacaoRodape}</strong><br>
		Langfuse: <code>/api/public/v2/metrics</code>, dimensão <code>environment</code>, granularidade dia. Gateway: <code>LiteLLM_DailyUserSpend</code> no banco do LiteLLM (só leitura). <code>/spend/logs</code> pelo HTTP do gateway.<br>
		Relatório gerado localmente. Não foi enviado a ninguém.
	</p>
</body></html>`;
}

// ─── Fluxo ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const litellmBase =
		process.env.RELATORIO_CUSTO_LITELLM_BASE?.trim() || process.env.LITELLM_BASE_URL?.trim();
	const litellmKey =
		process.env.RELATORIO_CUSTO_LITELLM_KEY?.trim() || process.env.LITELLM_API_KEY?.trim();
	const dbUrl = process.env.RELATORIO_CUSTO_DATABASE_URL?.trim() || undefined;
	const gatewayDbUrl = process.env.RELATORIO_CUSTO_LITELLM_DB_URL?.trim() || undefined;
	if (!litellmBase || !litellmKey) {
		throw new Error(
			"Informe RELATORIO_CUSTO_LITELLM_BASE e RELATORIO_CUSTO_LITELLM_KEY (o .env.local aponta para o gateway LOCAL).",
		);
	}

	const hoje = diaDoNegocio(new Date());
	const { token, criadaEm } = await tokenDaKey(litellmBase, litellmKey);
	const de = (criadaEm.slice(0, 10) || hoje) < hoje ? criadaEm.slice(0, 10) : hoje;
	console.log(`LiteLLM: key ${ALIAS_DA_KEY} criada em ${de} · /spend/logs ${de}..${hoje}`);

	// A SÉRIE PRINCIPAL: o agregado diário do gateway — a fonte que COBRA. O
	// `/spend/logs` só retém 14 dias; o `LiteLLM_DailyUserSpend` guarda desde
	// 24/06/2026. Sem o banco informado, o relatório DECLARA a ausência.
	const serieVazia: SerieGateway = {
		porDia: new Map(),
		porModelo: new Map(),
		porDiaModelo: new Map(),
		primeiro: "",
		ultimo: "",
	};
	let erroGateway: string | null = null;
	let gateway: SerieGateway = serieVazia;
	if (!gatewayDbUrl) {
		erroGateway =
			"informe RELATORIO_CUSTO_LITELLM_DB_URL (banco do gateway, só leitura) para a série principal";
	} else {
		try {
			gateway = lerGateway(gatewayDbUrl, token);
		} catch (erro) {
			erroGateway = erro instanceof Error ? erro.message : String(erro);
		}
	}

	let erroLiteLLM: string | null = null;
	const liteLLM = await serieDoLiteLLM(litellmBase, litellmKey, token, de, hoje).catch(
		(erro: Error) => {
			erroLiteLLM = erro.message;
			return new Map<string, number>();
		},
	);

	// O Langfuse entra como CONFERÊNCIA, desde o primeiro gasto do gateway até
	// hoje — não é a fonte que cobra.
	const deConferencia = gateway.primeiro || de;
	let erroLangfuse: string | null = null;
	const [langfuseBruto, cotacao, separacao, qwenSemPreco] = await Promise.all([
		serieDoLangfuse(deConferencia, hoje).catch((erro: Error) => {
			erroLangfuse = erro.message;
			return new Map<string, { producao: number; juiz: number; dev: number }>();
		}),
		resolverCotacao(hoje, dbUrl),
		separacaoRealTeste(deConferencia, hoje, dbUrl).catch((erro: Error) => ({ erro: erro.message })),
		confirmarQwenSemPreco(),
	]);

	const langfuse: SerieLangfuse = new Map(
		[...langfuseBruto.entries()].map(([dia, valor]) => [dia, { ...valor }]),
	);

	const { linhas, janelaLL } = montarLinhas(gateway, liteLLM, langfuse);
	const janelaGateway: [string, string] | null = gateway.primeiro
		? [gateway.primeiro, gateway.ultimo]
		: null;

	const geradoEm = new Intl.DateTimeFormat("pt-BR", {
		timeZone: FUSO,
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date());
	const saida = join(homedir(), "Downloads");
	mkdirSync(saida, { recursive: true });

	// CSV — a série crua, para reconferir. A série principal é o gateway; o
	// `/spend/logs` entra como reconferência (dia sem retenção = `sem dado
	// retido`, NUNCA `0`). Ausência de gateway é vazio, nunca `0`.
	const cabecalhoCsv =
		"dia;gateway_usd;gateway_brl;spend_logs_usd;langfuse_producao_usd;langfuse_juiz_usd;langfuse_dev_usd;cotacao_usd_brl";
	const linhasCsv = linhas.map((l) => {
		const gatewayCampo = l.gateway === null ? "" : l.gateway.toFixed(6);
		const gatewayBrl = l.gateway !== null && cotacao ? (l.gateway * cotacao.valor).toFixed(2) : "";
		const liteLLMCampo = l.liteLLM === null ? SEM_DADO_RETIDO : l.liteLLM.toFixed(6);
		return `${l.dia};${gatewayCampo};${gatewayBrl};${liteLLMCampo};${l.producao.toFixed(6)};${l.juiz.toFixed(6)};${l.dev.toFixed(6)};${cotacao ? cotacao.valor.toFixed(4) : ""}`;
	});
	const csv = [cabecalhoCsv, ...linhasCsv].join("\n");
	const csvPath = join(saida, `custo-ia-aja-agora-${hoje}.csv`);
	writeFileSync(csvPath, csv, "utf8");

	// PDF — o documento. HTML → Chrome headless (sem dependência nova).
	const htmlPath = join(saida, `custo-ia-aja-agora-${hoje}.html`);
	const pdfPath = join(saida, `custo-ia-aja-agora-${hoje}.pdf`);
	writeFileSync(
		htmlPath,
		htmlDoRelatorio({
			de: deConferencia,
			ate: hoje,
			linhas,
			janelaLL,
			janelaGateway,
			porModelo: gateway.porModelo,
			cotacao,
			erroGateway,
			erroLiteLLM,
			erroLangfuse,
			qwenSemPreco,
			separacao,
			dbInformado: Boolean(dbUrl),
			geradoEm,
		}),
		"utf8",
	);
	execFileSync(
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		[
			"--headless=new",
			"--disable-gpu",
			"--no-pdf-header-footer",
			`--print-to-pdf=${pdfPath}`,
			`file://${htmlPath}`,
		],
		{ stdio: "ignore" },
	);

	// Notas: os números das fontes — o que o relatório afirma.
	const totalGateway = linhas.reduce((t, l) => t + (l.gateway ?? 0), 0);
	const totalProducao = linhas.reduce((t, l) => t + l.producao, 0);
	const totalLL = linhas.reduce((t, l) => t + (l.liteLLM ?? 0), 0);
	console.log(
		`Gateway (LiteLLM_DailyUserSpend, ${janelaGateway ? `${janelaGateway[0]}..${janelaGateway[1]}` : "sem dado"}): ${totalGateway.toFixed(4)} USD` +
			(cotacao
				? ` = ${(totalGateway * cotacao.valor).toFixed(2)} BRL (cotação ${cotacao.valor})`
				: ""),
	);
	console.log(
		`Langfuse production (conferência, ${deConferencia}..${hoje}): ${erroLangfuse ? `indisponível (${erroLangfuse})` : `${totalProducao.toFixed(4)} USD`}${qwenSemPreco ? " — qwen SEM preço no Langfuse (registra 0)" : ""}`,
	);
	console.log(
		`/spend/logs (retenção ${janelaLL ? `${janelaLL[0]}..${janelaLL[1]}` : "—"}): ${erroLiteLLM ? `indisponível (${erroLiteLLM})` : `${totalLL.toFixed(4)} USD`}`,
	);
	console.log(`Cotação: ${cotacao ? `${cotacao.valor} — ${cotacao.fonte}` : "não calculável"}`);
	console.log(`CSV: ${csvPath}`);
	console.log(`PDF: ${pdfPath}`);
}

main().catch((erro: unknown) => {
	console.error("✗", erro instanceof Error ? erro.message : erro);
	process.exit(1);
});
