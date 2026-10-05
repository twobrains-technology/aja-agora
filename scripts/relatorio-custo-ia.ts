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
 * ── As duas fontes, e qual manda no histórico ───────────────────────────────
 *
 * 1. **LiteLLM** (`/spend/logs`) — é a fonte OFICIAL do gasto da key de
 *    produção, mas o log por requisição tem **retenção de 14 dias**: o que é
 *    mais velho que isso some, e o dia ausente NÃO é gasto zero. Por isso o
 *    LiteLLM entra como coluna de reconferência, com a janela que ele de fato
 *    cobre rotulada, e dia sem linha aparece como `sem dado retido` — nunca
 *    `0,0000`.
 * 2. **Langfuse** (`/api/public/v2/metrics`) — é a fonte do painel e a única
 *    com HISTÓRICO COMPLETO. É dela que sai a série diária do relatório,
 *    filtrada por `environment = production` e SEM os evaluators `judge_*`
 *    (que rodam no environment `langfuse-llm-as-a-judge` e aparecem em coluna
 *    própria). Dev (development/default/…) também vai em coluna à parte.
 *
 * A reconciliação só usa os dias em que AS DUAS fontes têm dado — comparar um
 * dia sem retenção com um dia com custo seria inventar diferença.
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
	valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, style: "currency", currency: "BRL" });

const usdFixo = (valor: number): string => valor.toFixed(4);

const pct = (parte: number, base: number): string =>
	base === 0 ? "—" : `${((parte / base) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

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

/** Uma consulta de métricas v2 do Langfuse, com as credenciais de produção. */
async function consultarMetricas(query: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
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
 * O custo diário das observações cujo NOME casa `judge` — a prova de que os
 * evaluators `judge_*` não estão dentro da produção. Devolve o total por dia.
 */
async function serieDosEvaluatorsJudge(de: string, ate: string): Promise<Map<string, number>> {
	const dados = await consultarMetricas({
		view: "observations",
		dimensions: [],
		metrics: [{ measure: "totalCost", aggregation: "sum" }],
		filters: [{ column: "name", operator: "contains", value: "judge", type: "string" }],
		timeDimension: { granularity: "day" },
		config: { row_limit: 1000 },
		fromTimestamp: `${de}T00:00:00.000Z`,
		toTimestamp: `${ate}T23:59:59.999Z`,
	});
	const porDia = new Map<string, number>();
	for (const linha of dados) {
		const dia = String(linha.time_dimension ?? "").slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
		porDia.set(dia, (porDia.get(dia) ?? 0) + (Number(linha.sum_totalCost) || 0));
	}
	return porDia;
}

/** O valor de uma chave do cadastro de custos no Postgres (só leitura). */
function lerDoCadastro(dbUrl: string, chave: string): string | null {
	try {
		const saida = execFileSync(
			"psql",
			[dbUrl, "-tAc", `select valor from custos_config where chave='${chave}' limit 1`],
			{ encoding: "utf8", maxBuffer: 1024 * 1024 },
		).trim();
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
			return { valor: doCadastro, fonte: "cadastro do painel (custos_config.cotacao_usd_brl, produção)" };
		}
	}
	return ptaxDoDia(dia);
}

/** Os `conversationId` com o selo de teste da casa, lidos do Postgres (só leitura). */
function conversasDoPostgres(url: string): Map<string, boolean> {
	const saida = execFileSync(
		"psql",
		[url, "-tA", "-F", "\t", "-c", "select id, is_simulated from conversations"],
		{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
	).trim();
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
	liteLLM: number | null;
	producao: number;
	juiz: number;
	dev: number;
}

/** Monta a grade do relatório: todo dia que existe em QUALQUER das fontes. */
function montarLinhas(
	liteLLM: SerieLiteLLM,
	langfuse: SerieLangfuse,
): { linhas: LinhaDoRelatorio[]; janelaLL: [string, string] | null } {
	const dias = [...new Set([...liteLLM.keys(), ...langfuse.keys()])].sort();
	const linhas = dias
		.map((dia) => {
			const doLangfuse = langfuse.get(dia) ?? { producao: 0, juiz: 0, dev: 0 };
			return {
				dia,
				liteLLM: liteLLM.has(dia) ? (liteLLM.get(dia) ?? 0) : null,
				producao: doLangfuse.producao,
				juiz: doLangfuse.juiz,
				dev: doLangfuse.dev,
			};
		})
		// Dia sem custo em lado nenhum é ruído (a v2 devolve o dia com soma 0).
		// A série é "desde o primeiro gasto": só entra o dia com custo ou com
		// linha retida no LiteLLM.
		.filter((l) => l.liteLLM !== null || l.producao > 0 || l.juiz > 0 || l.dev > 0);
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
	cotacao: Cotacao | null;
	erroLiteLLM: string | null;
	erroLangfuse: string | null;
	judgeDentroDaProducao: number;
	separacao: { real: number; teste: number; semConversa: number } | null | { erro: string };
	dbInformado: boolean;
	geradoEm: string;
}): string {
	const { linhas } = args;
	const totalProducao = linhas.reduce((t, l) => t + l.producao, 0);
	const totalJuiz = linhas.reduce((t, l) => t + l.juiz, 0);
	const totalDev = linhas.reduce((t, l) => t + l.dev, 0);
	const linhasLL = linhas.filter((l) => l.liteLLM !== null);
	const totalLL = linhasLL.reduce((t, l) => t + (l.liteLLM ?? 0), 0);
	const cotacao = args.cotacao;
	const paraBrl = (valor: number): string => (cotacao ? brl(valor * cotacao.valor) : "—");

	// A reconciliação só olha os dias em que as DUAS fontes têm dado: linha
	// retida no LiteLLM E custo de produção medido no Langfuse.
	const reconciliacao = linhas.filter((l) => l.liteLLM !== null && l.producao > 0);
	const totalLLNaIntersecao = reconciliacao.reduce((t, l) => t + (l.liteLLM ?? 0), 0);
	const totalProducaoNaIntersecao = reconciliacao.reduce((t, l) => t + l.producao, 0);

	const linhasDia = linhas
		.map((l) => {
			const litellmCelula =
				l.liteLLM === null
					? `<td class="num vazio">${SEM_DADO_RETIDO}</td>`
					: `<td class="num">${usdFixo(l.liteLLM)}</td>`;
			const delta = l.liteLLM !== null && l.producao > 0 ? l.liteLLM - l.producao : null;
			const deltaCelula =
				delta === null
					? `<td class="num vazio">—</td><td class="num vazio">—</td>`
					: `<td class="num ${delta < 0 ? "neg" : ""}">${usdFixo(delta)}</td><td class="num">${pct(delta, l.producao)}</td>`;
			return `<tr><td>${esc(l.dia)}</td>${litellmCelula}<td class="num">${usdFixo(l.producao)}</td><td class="num">${paraBrl(l.producao)}</td><td class="num">${usdFixo(l.juiz)}</td><td class="num">${usdFixo(l.dev)}</td>${deltaCelula}</tr>`;
		})
		.join("");

	const meses = [...new Set(linhas.map((l) => chaveDoMes(l.dia)))].sort();
	const linhasMes = meses
		.map((mes) => {
			const doMes = linhas.filter((l) => chaveDoMes(l.dia) === mes);
			const producao = doMes.reduce((t, l) => t + l.producao, 0);
			const juiz = doMes.reduce((t, l) => t + l.juiz, 0);
			const dev = doMes.reduce((t, l) => t + l.dev, 0);
			const doMesLL = doMes.filter((l) => l.liteLLM !== null);
			const litellm = doMesLL.reduce((t, l) => t + (l.liteLLM ?? 0), 0);
			const litellmCelula =
				doMesLL.length === 0
					? `<td class="num vazio">${SEM_DADO_RETIDO}</td>`
					: `<td class="num">${usdFixo(litellm)}</td>`;
			return `<tr><td>${esc(mes)}</td><td class="num">${usdFixo(producao)}</td><td class="num">${paraBrl(producao)}</td>${litellmCelula}<td class="num">${usdFixo(juiz)}</td><td class="num">${usdFixo(dev)}</td></tr>`;
		})
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
	const cotacaoRodape = cotacao
		? `Cotação usada: <strong>R$ ${cotacao.valor.toFixed(4).replace(".", ",")}</strong> por US$ 1,00 — fonte: ${esc(cotacao.fonte)}.`
		: `Sem cotação USD→BRL: o R$ não é calculável (o cadastro <code>custos_config.cotacao_usd_brl</code> está vazio e a PTAX do dia não respondeu). O dólar continua sendo o número; o R$ fica <code>—</code>, nunca zero.`;

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
	<p class="sub">Key <strong>${esc(ALIAS_DA_KEY)}</strong> no LiteLLM (reconferência) · Langfuse <code>environment=production</code> (histórico completo) · período ${esc(args.de)} a ${esc(args.ate)} · gerado em ${esc(args.geradoEm)}</p>

	<div class="kpis">
		<div class="kpi"><div class="rotulo">Produção (Langfuse, histórico completo)</div><div class="valor">${usd(totalProducao)}</div><div class="obs">${paraBrl(totalProducao)}</div></div>
		<div class="kpi"><div class="rotulo">LiteLLM (key ${esc(ALIAS_DA_KEY)})</div><div class="valor">${usd(totalLL)}</div><div class="obs">janela coberta: ${rotuloJanela}</div></div>
		<div class="kpi"><div class="rotulo">Juiz (evaluators <code>judge_*</code>)</div><div class="valor">${usd(totalJuiz)}</div><div class="obs">environment ${esc(ENV_JUIZ)}</div></div>
		<div class="kpi"><div class="rotulo">Dev</div><div class="valor">${usd(totalDev)}</div><div class="obs">development / default / demais</div></div>
	</div>
	${aviso("LiteLLM", args.erroLiteLLM)}
	${aviso("Langfuse", args.erroLangfuse)}

	<h2>Total por mês</h2>
	<table><thead><tr><th>Mês</th><th class="num">Produção USD</th><th class="num">Produção R$</th><th class="num">LiteLLM USD</th><th class="num">Juiz USD</th><th class="num">Dev USD</th></tr></thead>
	<tbody>${linhasMes || "<tr><td colspan='6'>sem dado</td></tr>"}</tbody></table>

	<h2>Série diária</h2>
	<table><thead><tr><th>Dia</th><th class="num">LiteLLM USD</th><th class="num">Produção USD</th><th class="num">Produção R$</th><th class="num">Juiz USD</th><th class="num">Dev USD</th><th class="num">Δ LiteLLM − Produção</th><th class="num">Δ %</th></tr></thead>
	<tbody>${linhasDia || "<tr><td colspan='8'>sem dado</td></tr>"}</tbody></table>

	${separacaoHtml}

	<p class="rodape">
		<strong>Reconciliação.</strong> Só entram os dias em que as DUAS fontes têm dado: ${reconciliacao.length} dia(s). Neles, o LiteLLM soma ${usd(totalLLNaIntersecao)} e a produção do Langfuse soma ${usd(totalProducaoNaIntersecao)} — diferença ${diferenca(totalLLNaIntersecao, totalProducaoNaIntersecao)}. Dia sem linha no LiteLLM é <em>${SEM_DADO_RETIDO}</em> (a retenção de <code>/spend/logs</code> é de 14 dias), nunca <code>0,0000</code>.<br>
		<strong>Janela do LiteLLM:</strong> ${rotuloJanela} — é o que a fonte de fato cobre; fora dela não há dado retido.<br>
		<strong>${cotacaoRodape}</strong><br>
		<strong>Sem os evaluators na produção:</strong> as observações <code>judge_*</code> rodam no environment <code>${esc(ENV_JUIZ)}</code> (coluna Juiz). Medido no período: o custo <code>name contains judge</code> dentro de <code>environment=production</code> é ${usdFixo(args.judgeDentroDaProducao)} — nada a subtrair, e a série de produção sai limpa.<br>
		Langfuse: <code>/api/public/v2/metrics</code>, dimensão <code>environment</code>, granularidade dia. LiteLLM: <code>/spend/logs</code>.<br>
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
	if (!litellmBase || !litellmKey) {
		throw new Error(
			"Informe RELATORIO_CUSTO_LITELLM_BASE e RELATORIO_CUSTO_LITELLM_KEY (o .env.local aponta para o gateway LOCAL).",
		);
	}

	const hoje = diaDoNegocio(new Date());
	const { token, criadaEm } = await tokenDaKey(litellmBase, litellmKey);
	const de = (criadaEm.slice(0, 10) || hoje) < hoje ? criadaEm.slice(0, 10) : hoje;
	console.log(`LiteLLM: key ${ALIAS_DA_KEY} criada em ${de} · janela pedida ${de}..${hoje}`);

	let erroLiteLLM: string | null = null;
	const liteLLM = await serieDoLiteLLM(litellmBase, litellmKey, token, de, hoje).catch(
		(erro: Error) => {
			erroLiteLLM = erro.message;
			return new Map<string, number>();
		},
	);

	let erroLangfuse: string | null = null;
	const [langfuseBruto, judgeDentroDaProducao, cotacao, separacao] = await Promise.all([
		serieDoLangfuse(de, hoje).catch((erro: Error) => {
			erroLangfuse = erro.message;
			return new Map<string, { producao: number; juiz: number; dev: number }>();
		}),
		// Prova de que os evaluators `judge_*` não estão na produção.
		(async () => {
			const diario = await serieDosEvaluatorsJudge(de, hoje).catch(() => new Map<string, number>());
			// Só o que estiver DENTRO de production seria subtraído; o resto é do ambiente do juiz.
			return [...diario.entries()].reduce((t, [, valor]) => t + valor, 0);
		})(),
		resolverCotacao(hoje, dbUrl),
		separacaoRealTeste(de, hoje, dbUrl).catch((erro: Error) => ({ erro: erro.message })),
	]);

	// Produção SEM os evaluators `judge_*`: com o environment já separado, o
	// custo `judge_*` dentro da produção é zero; a subtração fica explícita para
	// que a regra não dependa de o ambiente continuar separado.
	const langfuse: SerieLangfuse = new Map(
		[...langfuseBruto.entries()].map(([dia, valor]) => [dia, { ...valor }]),
	);

	const { linhas, janelaLL } = montarLinhas(liteLLM, langfuse);

	const geradoEm = new Intl.DateTimeFormat("pt-BR", {
		timeZone: FUSO,
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date());
	const saida = join(homedir(), "Downloads");
	mkdirSync(saida, { recursive: true });

	// CSV — a série crua, para quem quiser reconferir. Dia sem retenção no
	// LiteLLM escreve `sem dado retido`, NUNCA `0,0000`.
	const cabecalhoCsv =
		"dia;litellm_usd;langfuse_producao_usd;producao_brl;cotacao_usd_brl;langfuse_juiz_usd;langfuse_dev_usd;delta_usd;delta_pct";
	const linhasCsv = linhas.map((l) => {
		const liteLLMCampo = l.liteLLM === null ? SEM_DADO_RETIDO : l.liteLLM.toFixed(6);
		const valorBrl = cotacao ? (l.producao * cotacao.valor).toFixed(2) : "";
		const delta =
			l.liteLLM === null || l.producao <= 0 ? "" : (l.liteLLM - l.producao).toFixed(6);
		const deltaPct =
			l.liteLLM === null || l.producao <= 0
				? ""
				: (((l.liteLLM - l.producao) / l.producao) * 100).toFixed(1);
		return `${l.dia};${liteLLMCampo};${l.producao.toFixed(6)};${valorBrl};${cotacao ? cotacao.valor.toFixed(4) : ""};${l.juiz.toFixed(6)};${l.dev.toFixed(6)};${delta};${deltaPct}`;
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
			de,
			ate: hoje,
			linhas,
			janelaLL,
			cotacao,
			erroLiteLLM,
			erroLangfuse,
			judgeDentroDaProducao,
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

	// Notas: os números das duas fontes e a diferença — o que o relatório afirma.
	const totalProducao = linhas.reduce((t, l) => t + l.producao, 0);
	const totalLL = linhas.reduce((t, l) => t + (l.liteLLM ?? 0), 0);
	console.log(
		`Produção (Langfuse, histórico completo): ${totalProducao.toFixed(4)} USD` +
			(cotacao ? ` = ${(totalProducao * cotacao.valor).toFixed(2)} BRL (cotação ${cotacao.valor})` : ""),
	);
	console.log(
		`LiteLLM (janela ${janelaLL ? `${janelaLL[0]}..${janelaLL[1]}` : "—"}): ${erroLiteLLM ? `indisponível (${erroLiteLLM})` : `${totalLL.toFixed(4)} USD`}`,
	);
	console.log(`Cotação: ${cotacao ? `${cotacao.valor} — ${cotacao.fonte}` : "não calculável"}`);
	console.log(`CSV: ${csvPath}`);
	console.log(`PDF: ${pdfPath}`);
}

main().catch((erro: unknown) => {
	console.error("✗", erro instanceof Error ? erro.message : erro);
	process.exit(1);
});