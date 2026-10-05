#!/usr/bin/env node
/**
 * Relatório de custo de IA do Aja Agora — a série diária do gasto da key
 * `aja-agora-prod` no LiteLLM, total por mês, reconciliada com o Langfuse de
 * produção e, onde der, separando conversa real de teste da casa.
 *
 * ── Por que este relatório existe ───────────────────────────────────────────
 *
 * A cliente (Bruna, 22/09) pediu o custo de IA para fechar o CPC. O painel de
 * Performance mostra o total do período; falta a SÉRIE — dia a dia, mês a mês,
 * com as duas fontes lado a lado e a diferença entre elas declarada.
 *
 * ── As duas fontes, e por que as duas ───────────────────────────────────────
 *
 * 1. **LiteLLM** (`/spend/logs?api_key=<token>`) — é a fonte OFICIAL do
 *    gasto: cada requisição que passou pelo gateway fica registrada e o
 *    agregado DIÁRIO sobrevive (o log por requisição só vive 14 dias). A série
 *    do relatório sai daqui.
 * 2. **Langfuse** (`/api/public/v2/metrics`) — é a fonte do painel: o custo por
 *    trace. Serve de RECONCILIAÇÃO — se as duas divergirem muito, uma das duas
 *    está medindo outra coisa, e quem lê precisa saber.
 *
 * ── Uso (no host, com o túnel SSM até o gateway de produção) ────────────────
 *
 *   RELATORIO_CUSTO_LITELLM_BASE=http://127.0.0.1:14000 \
 *   RELATORIO_CUSTO_LITELLM_KEY=<master key do cofre> \
 *   RELATORIO_CUSTO_DATABASE_URL=<túnel de produção, só leitura> \
 *     pnpm tsx scripts/relatorio-custo-ia.ts
 *
 * As três variáveis existem porque o `.env.local` é do app (gateway local e
 * banco local) e não serve para ler produção; e porque chave NUNCA vai em
 * argumento de linha de comando (aparece no `ps`).
 *
 * Saída: `~/Downloads/custo-ia-aja-agora-<data>.pdf` e `.csv`.
 * **Não envia o relatório a ninguém** — o envio é do dono.
 *
 * Sem driver de banco: lê o Postgres de produção com `psql` (já instalado),
 * como o `relatorio-conversas.mjs`. Sem dependência nova.
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

const reais = (usd: number): string =>
	usd.toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 4,
		style: "currency",
		currency: "USD",
	});

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

interface Ponto {
	dia: string;
	usd: number;
}

/** Uma chamada ao LiteLLM, autenticada com a key fornecida. */
async function chamarLiteLLM(base: string, key: string, caminho: string): Promise<unknown> {
	const resposta = await fetch(`${base.replace(/\/$/, "")}${caminho}`, {
		headers: { Authorization: `Bearer ${key}` },
		cache: "no-store",
	});
	if (!resposta.ok) throw new Error(`litellm-${resposta.status} em ${caminho}`);
	return resposta.json();
}

/** O token (hash) da key `aja-agora-prod` — exige a master key, que lista as keys. */
async function tokenDaKey(base: string, key: string): Promise<{ token: string; criadaEm: string }> {
	const lista = (await chamarLiteLLM(base, key, "/key/list?return_full_object=true&size=100")) as {
		keys?: unknown[];
	};
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

/** A série diária do gasto da key no LiteLLM — a fonte oficial. */
async function serieDoLiteLLM(
	base: string,
	key: string,
	token: string,
	de: string,
	ate: string,
): Promise<Ponto[]> {
	const linhas = (await chamarLiteLLM(
		base,
		key,
		`/spend/logs?api_key=${encodeURIComponent(token)}&start_date=${de}&end_date=${ate}`,
	)) as Array<Record<string, unknown>>;
	return linhas
		.filter((linha) => /^\d{4}-\d{2}-\d{2}$/.test(String(linha.startTime ?? "")))
		.map((linha) => ({ dia: String(linha.startTime), usd: Number(linha.spend) || 0 }))
		.filter((ponto) => ponto.usd > 0)
		.sort((a, b) => (a.dia < b.dia ? -1 : 1));
}

/** A série diária de custo do projeto no Langfuse (`v2/metrics`) — a fonte do painel. */
async function serieDoLangfuse(de: string, ate: string): Promise<Ponto[]> {
	const base = process.env.LANGFUSE_BASE_URL?.trim();
	const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
	const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
	if (!base || !publicKey || !secretKey) throw new Error("LANGFUSE_* ausentes no ambiente");

	const query = JSON.stringify({
		view: "observations",
		dimensions: [],
		metrics: [{ measure: "totalCost", aggregation: "sum" }],
		filters: [],
		timeDimension: { granularity: "day" },
		// A v2 corta em 100 linhas por padrão e devolve os dias MAIS ANTIGOS primeiro —
		// sem o teto explícito, uma janela longa derruba os dias recentes em silêncio.
		config: { row_limit: 1000 },
		fromTimestamp: `${de}T00:00:00.000Z`,
		toTimestamp: `${ate}T23:59:59.999Z`,
	});
	const resposta = await fetch(
		`${base.replace(/\/$/, "")}/api/public/v2/metrics?query=${encodeURIComponent(query)}`,
		{
			headers: {
				Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
			},
			cache: "no-store",
		},
	);
	if (!resposta.ok) throw new Error(`langfuse-metrics-${resposta.status}`);
	const payload = (await resposta.json()) as { data?: Array<Record<string, unknown>> };
	return (payload.data ?? [])
		.map((linha) => ({
			dia: String(linha.time_dimension ?? "").slice(0, 10),
			usd: Number(linha.sum_totalCost) || 0,
		}))
		.filter((ponto) => /^\d{4}-\d{2}-\d{2}$/.test(ponto.dia) && ponto.usd !== 0)
		.sort((a, b) => (a.dia < b.dia ? -1 : 1));
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
			const usd = (linha.custoUsdCents ?? 0) / 100;
			const simulado = porConversa.get(linha.sessionId);
			if (simulado === undefined) semConversa += usd;
			else if (simulado) teste += usd;
			else real += usd;
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

function somar(pontos: readonly Ponto[]): number {
	return pontos.reduce((total, ponto) => total + ponto.usd, 0);
}

function htmlDoRelatorio(args: {
	de: string;
	ate: string;
	liteLLM: Ponto[] | { erro: string };
	langfuse: Ponto[] | { erro: string };
	separacao: { real: number; teste: number; semConversa: number } | null | { erro: string };
	dbInformado: boolean;
	geradoEm: string;
}): string {
	const ll = Array.isArray(args.liteLLM) ? args.liteLLM : [];
	const lf = Array.isArray(args.langfuse) ? args.langfuse : [];
	const totalLL = somar(ll);
	const totalLF = somar(lf);
	// A reconciliação olha a MESMA janela: o LiteLLM só tem o que passou pela key
	// `aja-agora-prod` (a partir do primeiro gasto), e o Langfuse cobre o projeto
	// inteiro desde agosto. Comparar totais de janelas diferentes mentiria.
	const primeiroDiaLL = ll[0]?.dia ?? null;
	const lfNaJanela = primeiroDiaLL ? lf.filter((ponto) => ponto.dia >= primeiroDiaLL) : lf;
	const totalLFJanela = somar(lfNaJanela);
	const mapaLF = new Map(lf.map((ponto) => [ponto.dia, ponto.usd]));
	const dias = [...new Set([...ll.map((p) => p.dia), ...lf.map((p) => p.dia)])].sort();

	const linhasDia = dias
		.map((dia) => {
			const a = ll.find((p) => p.dia === dia)?.usd ?? 0;
			const b = mapaLF.get(dia) ?? 0;
			const delta = a - b;
			return `<tr><td>${esc(dia)}</td><td class="num">${a.toFixed(4)}</td><td class="num">${b.toFixed(4)}</td><td class="num ${delta < 0 ? "neg" : ""}">${delta.toFixed(4)}</td><td class="num">${pct(delta, b)}</td></tr>`;
		})
		.join("");

	const meses = [
		...new Set([...ll.map((p) => p.dia.slice(0, 7)), ...lf.map((p) => p.dia.slice(0, 7))]),
	].sort();
	const linhasMes = meses
		.map((mes) => {
			const doLL = ll.filter((p) => p.dia.slice(0, 7) === mes).reduce((t, p) => t + p.usd, 0);
			const doMes = lf.filter((p) => p.dia.slice(0, 7) === mes).reduce((t, p) => t + p.usd, 0);
			return `<tr><td>${esc(mes)}</td><td class="num">${doLL.toFixed(4)}</td><td class="num">${doMes.toFixed(4)}</td><td class="num">${diferenca(doLL, doMes)}</td></tr>`;
		})
		.join("");

	const separacao = args.separacao && !("erro" in args.separacao) ? args.separacao : null;
	const totalSeparado = separacao ? separacao.real + separacao.teste + separacao.semConversa : 0;
	// O custo do Langfuse v4 vive nas observações SEM `sessionId` (a sessão mora no
	// trace; as generations que custam não a carregam). Quando a fatia com sessão é
	// irrisória, dizer "real × teste" seria inventar separação: declara-se que não é
	// calculável, com a causa.
	const separacaoCalculavel = Boolean(separacao) && totalSeparado >= totalLF * 0.05;
	const separacaoHtml =
		separacaoCalculavel && separacao
			? `
				<h2>Custo do Langfuse: conversa real × teste da casa</h2>
				<table>
					<thead><tr><th>Origem</th><th class="num">USD</th><th class="num">% do total</th></tr></thead>
					<tbody>
						<tr><td>Conversa real (<code>is_simulated = false</code>)</td><td class="num">${separacao.real.toFixed(4)}</td><td class="num">${pct(separacao.real, totalSeparado)}</td></tr>
						<tr><td>Teste da casa (<code>is_simulated = true</code>)</td><td class="num">${separacao.teste.toFixed(4)}</td><td class="num">${pct(separacao.teste, totalSeparado)}</td></tr>
						<tr><td>Sem conversa no banco (inclui dev/avulso)</td><td class="num">${separacao.semConversa.toFixed(4)}</td><td class="num">${pct(separacao.semConversa, totalSeparado)}</td></tr>
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
								: `A fatia com sessão identificada (${reais(totalSeparado)}) é irrisória diante do total (${reais(totalLF)}) — a separação não teria significado. A sessão mora no trace; as observações que custam não a carregam.`
				}</p>`;

	const aviso = (fonte: string, valor: Ponto[] | { erro: string }) =>
		Array.isArray(valor) ? "" : `<p class="nota neg">${fonte} indisponível: ${esc(valor.erro)}</p>`;

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
	.kpis { display: flex; gap: 14px; margin: 18px 0 6px; }
	.kpi { flex: 1; background: #fff; border: 1px solid #e2e6ea; border-radius: 10px; padding: 14px 16px; }
	.kpi .rotulo { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6b7b8c; }
	.kpi .valor { font-size: 22px; font-weight: 700; color: var(--navy); margin-top: 6px; }
	table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e6ea; border-radius: 8px; overflow: hidden; font-size: 12px; }
	th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eef1f4; }
	th { background: #f4f7fa; color: var(--navy); font-weight: 600; }
	td.num { text-align: right; font-variant-numeric: tabular-nums; }
	.neg { color: var(--coral); }
	.nota { font-size: 12px; color: #5b6b7c; }
	.rodape { margin-top: 26px; font-size: 11px; color: #7b8b9c; }
</style></head><body>
	<h1>Custo de IA — Aja Agora</h1>
	<p class="sub">Key <strong>${esc(ALIAS_DA_KEY)}</strong> no LiteLLM · período ${esc(args.de)} a ${esc(args.ate)} · gerado em ${esc(args.geradoEm)}</p>

	<div class="kpis">
		<div class="kpi"><div class="rotulo">LiteLLM (fonte oficial)</div><div class="valor">${reais(totalLL)}</div></div>
		<div class="kpi"><div class="rotulo">Langfuse · mesma janela (a partir de ${esc(primeiroDiaLL ?? "—")})</div><div class="valor">${reais(totalLFJanela)}</div></div>
		<div class="kpi"><div class="rotulo">Diferença LiteLLM − Langfuse</div><div class="valor">${diferenca(totalLL, totalLFJanela)}</div></div>
	</div>
	${aviso("LiteLLM", args.liteLLM)}
	${aviso("Langfuse", args.langfuse)}

	<h2>Total por mês</h2>
	<table><thead><tr><th>Mês</th><th class="num">LiteLLM (USD)</th><th class="num">Langfuse (USD)</th><th class="num">LiteLLM − Langfuse</th></tr></thead>
	<tbody>${linhasMes || "<tr><td colspan='4'>sem dado</td></tr>"}</tbody></table>

	<h2>Série diária</h2>
	<table><thead><tr><th>Dia</th><th class="num">LiteLLM (USD)</th><th class="num">Langfuse (USD)</th><th class="num">Δ USD</th><th class="num">Δ %</th></tr></thead>
	<tbody>${linhasDia || "<tr><td colspan='5'>sem dado</td></tr>"}</tbody></table>

	${separacaoHtml}

	<p class="rodape">
		LiteLLM: <code>/spend/logs</code> (agregado diário; o log por requisição vive 14 dias). Langfuse: <code>/api/public/v2/metrics</code>.<br>
		O Langfuse cobre o projeto inteiro (inclui o LLM-juiz e o ambiente de dev): no período completo, que começa em ${esc(lf[0]?.dia ?? "—")}, o total é ${reais(totalLF)}. O LiteLLM mede só o que passou pela key ${esc(ALIAS_DA_KEY)} — a partir de ${esc(primeiroDiaLL ?? "—")}. A reconciliação acima compara as duas na MESMA janela; a diferença é esperada e está declarada, não é rateio inventado.<br>
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
	console.log(`LiteLLM: key ${ALIAS_DA_KEY}, janela ${de}..${hoje}`);

	const liteLLM = await serieDoLiteLLM(litellmBase, litellmKey, token, de, hoje).catch(
		(erro: Error) => ({
			erro: erro.message,
		}),
	);
	// A separação real × teste só faz sentido na janela em que o LiteLLM tem dado.
	const primeiroDiaLL = Array.isArray(liteLLM) && liteLLM.length > 0 ? liteLLM[0].dia : de;
	const [langfuse, separacao] = await Promise.all([
		serieDoLangfuse(de, hoje).catch((erro: Error) => ({ erro: erro.message })),
		separacaoRealTeste(primeiroDiaLL, hoje, dbUrl).catch((erro: Error) => ({ erro: erro.message })),
	]);

	const geradoEm = new Intl.DateTimeFormat("pt-BR", {
		timeZone: FUSO,
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date());
	const saida = join(homedir(), "Downloads");
	mkdirSync(saida, { recursive: true });

	// CSV — a série crua, para quem quiser reconferir.
	const ll = Array.isArray(liteLLM) ? liteLLM : [];
	const lf = Array.isArray(langfuse) ? langfuse : [];
	const mapaLF = new Map(lf.map((p) => [p.dia, p.usd]));
	const dias = [...new Set([...ll.map((p) => p.dia), ...lf.map((p) => p.dia)])].sort();
	const csv = [
		"dia;litellm_usd;langfuse_usd;delta_usd;delta_pct",
		...dias.map((dia) => {
			const a = ll.find((p) => p.dia === dia)?.usd ?? 0;
			const b = mapaLF.get(dia) ?? 0;
			const delta = a - b;
			const dPct = b === 0 ? "" : ((delta / b) * 100).toFixed(1);
			return `${dia};${a.toFixed(6)};${b.toFixed(6)};${delta.toFixed(6)};${dPct}`;
		}),
	].join("\n");
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
			liteLLM,
			langfuse,
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
	const total = (pontos: Ponto[] | { erro: string }) =>
		Array.isArray(pontos) ? somar(pontos).toFixed(4) : `indisponível (${pontos.erro})`;
	console.log(`LiteLLM total: ${total(liteLLM)} USD · Langfuse total: ${total(langfuse)} USD`);
	console.log(`CSV: ${csvPath}`);
	console.log(`PDF: ${pdfPath}`);
}

main().catch((erro: unknown) => {
	console.error("✗", erro instanceof Error ? erro.message : erro);
	process.exit(1);
});
