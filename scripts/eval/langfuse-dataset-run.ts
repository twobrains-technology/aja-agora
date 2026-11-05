// ── B10 — Dataset run do `pnpm eval` na instância Langfuse ───────────────
//
// O runner continua sendo O GATE (`scripts/eval-run.ts`); com `--dataset-run`
// ele além do relatório local grava o run na instância Langfuse. Premissa do
// dono (D-0083, Q1): re-run da MESMA conduta alimenta O MESMO run — o
// `runName` é determinístico (`gate-<sha de conduta>`, sem timestamp) e o
// `iniciar` ancora o run existente pelo item âncora (ver abaixo). Conduta nova
// → sha novo → run novo → comparação side-by-side na UI. Cada execução é uma
// RODADA do run (o comentário do score agregado registra qual); cada cenário
// executado vira um item do run, e cada item recebe
// scores: trajetória determinística (veredito dos asserts), juiz offline
// (5 dimensões da rubrica) e os sinais B4/B5 (`numero_fora_da_cota`,
// `promessa_sem_fato`). O run fecha com score agregado por run.
//
// API real da instância (sondada 05/11/2026, Langfuse v4 events_only):
//   · `POST /api/public/dataset-runs` NÃO existe (404) e
//     `POST /api/public/experiments` responde 405 — o run nasce IMPLÍCITO no
//     `POST /api/public/dataset-run-items` (body: `datasetItemId`, `traceId`,
//     `runName`, `runDescription`), que devolve o `datasetRunId`.
//   · Scores por `POST /api/public/scores` (o endpoint vivo; a leitura nova é
//     `GET /api/public/v3/scores`, mas gravação em `/v3/scores` devolve 405)
//     com `datasetRunId` (+ `datasetItemId` por item) — é assim que dois
//     runs ficam comparáveis side-by-side na UI. O POST /scores aceita `id`
//     explícito (upsert): com id determinístico por (run, item, score), o
//     re-run SOBRESCREVE o score da rodada anterior em vez de duplicar — e o
//     comentário do agregado registra a rodada.
//   · `GET /api/public/dataset-runs?datasetName=...` NÃO existe na instância
//     (devolve HTML 200 — provado com curl, D-0083 Bloco A-FIX): a busca do
//     run por listagem morreu. A âncora em `/dataset-run-items` é a única
//     fonte de verdade do id do run.
//   · `GET /api/public/dataset-items?datasetName=...&page=N&limit=50` é
//     instável (páginas podem vir HTML 200 sem log de falha) — a paginação do
//     mapeamento é defensiva: pagina enquanto a página vier cheia, trata
//     não-JSON como falha e retenta 1× por página.
//
// Lei da casa (plano B10 e premissa): falha de Langfuse NUNCA quebra o eval —
// todo método engole erro com log e desliga o gravador na primeira falha
// fatal; sem credenciais, o gravador nem liga. Nada aqui altera o veredito.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const NOME_DO_DATASET = "aja-agora-eval";
const COFRE = "pi-agentes-aja-langfuse";

const PREFIXO = "[dataset-run]";

export type ScoreDoItem = {
	name: string;
	value: number | boolean;
	dataType: "NUMERIC" | "BOOLEAN";
	comment: string;
};

export type ItemDoRun = {
	/** Nome do cenário golden (`golden-...`). */
	cenario: string;
	/** Veredito do runner para este item. */
	status: "pass" | "fail" | "erro" | "inconclusivo";
	/** Id do item do dataset, quando o cenário tem item mapeado no dataset. */
	datasetItemId: string | null;
	/** Id da conversa simulada — rastreio no comentário do score. */
	conversationId: string | null;
	/** Trajetória completa do cenário (turnos com artifacts). */
	turns: Array<{
		userMsg: string;
		agentText: string;
		artifacts: Array<{ type: string; data: unknown }>;
	}>;
	/** Quantas propostas a conversa gerou (desfecho real, B5). */
	propostas: number;
};

function doCofre(chave: string): string | null {
	try {
		return (
			execFileSync("secrets.sh", ["get-key", COFRE, chave], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim() || null
		);
	} catch {
		return null;
	}
}

/** `tb-langfuse-web` não resolve do Mac — mesmo ajuste do `_env-host`. */
function paraHost(url: string): string {
	try {
		const u = new URL(url);
		if (u.hostname.includes(".") || u.hostname === "localhost") return url;
		u.hostname = `${u.hostname}.orb.local`;
		return u.toString().replace(/\/$/, "");
	} catch {
		return url;
	}
}

type Candidata = { baseUrl: string; publicKey: string; secretKey: string; origem: string };

function candidatas(): Candidata[] {
	const out: Candidata[] = [];
	const ler = (origem: string, pega: (k: string) => string | null) => {
		const baseUrl = pega("LANGFUSE_BASE_URL");
		const publicKey = pega("LANGFUSE_PUBLIC_KEY");
		const secretKey = pega("LANGFUSE_SECRET_KEY");
		if (baseUrl && publicKey && secretKey) out.push({ origem, baseUrl, publicKey, secretKey });
	};
	ler("ambiente", (k) => process.env[k]?.trim() || null);
	ler("vault:pi-agentes-aja-langfuse", (k) => doCofre(k));
	return out;
}

type Sinal = { ok: boolean; dados?: unknown; detalhe?: string };

const ITEM_ANCORA = "aja-anchor-eval";
const LIMIT_PAGINA = 50;

/** Âncora do run: POST `/dataset-run-items` com o item `aja-anchor-eval` no
 *  runName da conduta. O `datasetRunId` devolvido é o id do run (existente
 *  ou novo) — a única fonte de verdade. Se o item âncora ainda não existe no
 *  dataset, cria-o e retenta 1×. Falha → `null` (degrada sem run). */
async function ancorarRun(
	baseUrl: string,
	auth: string,
	runName: string,
	sha: string,
): Promise<string | null> {
	const postItem = async (): Promise<Sinal> => {
		try {
			const r = await fetch(`${baseUrl}/api/public/dataset-run-items`, {
				method: "POST",
				headers: { authorization: auth, "content-type": "application/json" },
				body: JSON.stringify({
					datasetItemId: ITEM_ANCORA,
					traceId: `eval-anchor-${runName}`,
					runName,
					runDescription: `pnpm eval gate · sha ${sha} · ${runName}`,
				}),
			});
			const texto = await r.text();
			let json: unknown = null;
			try {
				json = JSON.parse(texto);
			} catch {
				// resposta não-JSON (html) — tratada como falha abaixo
			}
			if (!r.ok) {
				return { ok: false, detalhe: `HTTP ${r.status}: ${String(texto).slice(0, 200)}` };
			}
			return { ok: true, dados: json };
		} catch (e) {
			return { ok: false, detalhe: e instanceof Error ? e.message : String(e) };
		}
	};
	let r = await postItem();
	if (!r.ok) {
		// Item âncora pode não existir ainda — cria (id determinístico) e retenta 1×.
		try {
			const rc = await fetch(`${baseUrl}/api/public/dataset-items`, {
				method: "POST",
				headers: { authorization: auth, "content-type": "application/json" },
				body: JSON.stringify({
					id: ITEM_ANCORA,
					datasetName: NOME_DO_DATASET,
					input: { ancora: true },
					expectedOutput: { ancora: "item âncora do run — não é cenário" },
					metadata: { anchor: true },
				}),
			});
			if (!rc.ok) {
				console.error(
					`${PREFIXO} item âncora não criado (HTTP ${rc.status}) — eval segue SEM dataset run.`,
				);
				return null;
			}
		} catch (e) {
			console.error(
				`${PREFIXO} item âncora não criado (${e instanceof Error ? e.message : e}) — eval segue SEM dataset run.`,
			);
			return null;
		}
		r = await postItem();
		if (!r.ok) {
			console.error(`${PREFIXO} âncora do run falhou (${r.detalhe}) — eval segue SEM dataset run.`);
			return null;
		}
	}
	const id = (r.dados as { datasetRunId?: string } | null)?.datasetRunId;
	if (!id) {
		console.error(`${PREFIXO} âncora não devolveu datasetRunId — eval segue SEM dataset run.`);
		return null;
	}
	return id;
}

/** Cliente REST mínimo — nunca lança além do que o caller espera. */
export class DatasetRunRecorder {
	private readonly base: string;
	private readonly auth: string;
	/** Primeira falha fatal desliga o gravador: sem spam, sem custo. */
	private morto = false;

	private constructor(cred: Candidata, datasetRunId: string) {
		this.base = cred.baseUrl;
		this.auth = `Basic ${Buffer.from(`${cred.publicKey}:${cred.secretKey}`).toString("base64")}`;
		this.datasetRunId = datasetRunId;
	}

	/** Cria (ou acha) o run para esta execução. `null` = sem Langfuse, o eval segue. */
	static async iniciar(args: {
		/** Nome do run — o mesmo `runName` do relatório local. */
		nome: string;
		/** Sha curto do código sob teste. */
		sha: string;
	}): Promise<DatasetRunRecorder | null> {
		const lista = candidatas();
		if (lista.length === 0) {
			console.log(
				`${PREFIXO} sem credenciais LANGFUSE_* (env/vault) — eval segue SEM dataset run.`,
			);
			return null;
		}
		for (const c of lista) {
			const baseUrl = paraHost(c.baseUrl);
			const auth = `Basic ${Buffer.from(`${c.publicKey}:${c.secretKey}`).toString("base64")}`;
			// 1. dataset existe?
			try {
				const r = await fetch(`${baseUrl}/api/public/datasets/${NOME_DO_DATASET}`, {
					headers: { authorization: auth },
				});
				if (!r.ok) {
					console.log(
						`${PREFIXO} credenciais ${c.origem} recusadas no GET dataset (HTTP ${r.status}).`,
					);
					continue;
				}
			} catch (e) {
				console.log(
					`${PREFIXO} credenciais ${c.origem} inalcançáveis: ${e instanceof Error ? e.message : e}`,
				);
				continue;
			}
			// 2. Âncora (D-0083 Bloco A-FIX): o id do run vem do POST em
			//    `/dataset-run-items` com o item âncora determinístico — se o runName
			//    já tem run, o id devolvido é o DELE (provado em prod); se não, nasce
			//    um run novo. Sem listagem de runs (o endpoint não existe). Se o POST
			//    falhar, degrada sem run.
			const runId = await ancorarRun(baseUrl, auth, args.nome, args.sha);
			if (!runId) continue;
			console.log(`${PREFIXO} run ancorado: ${runId} (${args.nome}).`);
			const rec = new DatasetRunRecorder({ ...c, baseUrl }, runId);
			rec.runName = args.nome;
			rec.runDescricao = `pnpm eval gate · sha ${args.sha} · ${args.nome}`;
			return rec;
		}
		console.log(`${PREFIXO} nenhuma credencial válida — eval segue SEM dataset run.`);
		return null;
	}

	private runName = "";
	private runDescricao = "";
	/** Id do run, devolvido pelo primeiro `dataset-run-items` gravado. */
	private datasetRunId: string;

	private async pedir(metodo: "POST" | "GET", caminho: string, corpo?: unknown): Promise<Sinal> {
		if (this.morto) return { ok: false, detalhe: "gravador desligado por falha anterior" };
		try {
			const r = await fetch(`${this.base}${caminho}`, {
				method: metodo,
				headers: { authorization: this.auth, "content-type": "application/json" },
				body: corpo === undefined ? undefined : JSON.stringify(corpo),
			});
			const texto = await r.text();
			let json: unknown = texto;
			try {
				json = JSON.parse(texto);
			} catch {
				// resposta não-JSON (html de 404, por exemplo) vira texto
			}
			if (!r.ok) {
				return {
					ok: false,
					detalhe: `HTTP ${r.status} em ${caminho}: ${String(texto).slice(0, 200)}`,
				};
			}
			if (typeof json === "string") {
				// Resposta não-JSON (html de gateway, por exemplo) é falha — não dado.
				return {
					ok: false,
					detalhe: `resposta não-JSON (HTTP ${r.status}) em ${caminho}: ${String(texto).slice(0, 200)}`,
				};
			}
			return { ok: true, dados: json };
		} catch (e) {
			return { ok: false, detalhe: `${caminho}: ${e instanceof Error ? e.message : e}` };
		}
	}

	private falhar(detalhe: string): void {
		this.morto = true;
		console.error(`${PREFIXO} falha fatal (resto da execução segue SEM dataset run): ${detalhe}`);
	}

	/** Mapa cenário golden → datasetItemId, lido do `metadata.golden` dos itens.
	 *  Paginação robusta (D-0083 Bloco A-FIX): pagina enquanto a página vier
	 *  cheia (== limit), trata resposta não-JSON/HTML como falha explícita e
	 *  retenta 1× por página antes de desistir — a listagem é instável na
	 *  instância e, com a 1ª página truncada, os itens seriam recriados e o run
	 *  divergiria. Falha de página → desiste com mapa parcial e log explícito
	 *  (o eval segue; cenário sem item ganha item criado na hora). */
	async itensPorCenario(): Promise<Map<string, string>> {
		const mapa = new Map<string, string>();
		for (let pagina = 1; ; pagina += 1) {
			const caminho = `/api/public/dataset-items?datasetName=${NOME_DO_DATASET}&page=${pagina}&limit=${LIMIT_PAGINA}`;
			let r = await this.pedir("GET", caminho);
			if (!r.ok) {
				console.error(
					`${PREFIXO} página ${pagina} dos itens falhou (${r.detalhe}) — retentando 1×.`,
				);
				r = await this.pedir("GET", caminho);
			}
			if (!r.ok) {
				console.error(
					`${PREFIXO} página ${pagina} dos itens falhou 2× (${r.detalhe}) — mapa truncado em ${mapa.size} cenário(s); itens faltantes serão criados na hora.`,
				);
				return mapa;
			}
			const dados = (r.dados as { data?: unknown[] } | undefined)?.data;
			if (!Array.isArray(dados)) {
				console.error(
					`${PREFIXO} página ${pagina} dos itens não veio como JSON com data — mapa truncado em ${mapa.size} cenário(s); itens faltantes serão criados na hora.`,
				);
				return mapa;
			}
			for (const item of dados as Array<{ id?: string; metadata?: { golden?: string[] } }>) {
				if (!item.id) continue;
				for (const cenario of item.metadata?.golden ?? []) {
					if (!mapa.has(cenario)) mapa.set(cenario, item.id);
				}
			}
			if (dados.length < LIMIT_PAGINA) break;
		}
		console.log(`${PREFIXO} ${mapa.size} cenário(s) golden mapeados em itens do dataset.`);
		return mapa;
	}

	/** Cria (upsert) um item no dataset para um cenário não mapeado pelo seed —
	 *  id determinístico `aja-<slug>`; re-run nunca duplica. A API do
	 *  `dataset-run-items` EXIGE um `datasetItemId` string (medido 05/11: null
	 *  devolve 400), então cenário sem item do seed ganha o seu aqui. */
	private async itemPara(item: ItemDoRun): Promise<string | null> {
		if (item.datasetItemId) return item.datasetItemId;
		const cache = this.itensCriados.get(item.cenario);
		if (cache) return cache;
		const id = `aja-${item.cenario.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`.slice(0, 60);
		const r = await this.pedir("POST", "/api/public/dataset-items", {
			id,
			datasetName: NOME_DO_DATASET,
			input: { cenario: item.cenario, turnos: item.turns.length },
			expectedOutput: {
				invariantes: [
					"Invariantes de trajetória do golden-set (scripts/eval/golden) — veredito do runner.",
				],
			},
			metadata: { golden: [item.cenario], fonte: "eval-runner" },
		});
		if (!r.ok) {
			console.error(`${PREFIXO} criação de item p/ ${item.cenario} falhou: ${r.detalhe}`);
			return null;
		}
		const real = (r.dados as { id?: string }).id ?? id;
		this.itensCriados.set(item.cenario, real);
		console.log(
			`${PREFIXO} item do dataset criado p/ cenário não mapeado: ${item.cenario} (${real})`,
		);
		return real;
	}

	private itensCriados = new Map<string, string>();

	/** Anexa o item ao run (POST dataset-run-items) e grava os scores dele. */
	async anexar(item: ItemDoRun, scores: ScoreDoItem[]): Promise<void> {
		if (this.morto) return;
		const datasetItemId = await this.itemPara(item);
		if (!datasetItemId) {
			this.falhar(`sem datasetItemId para ${item.cenario}`);
			return;
		}
		item.datasetItemId = datasetItemId;
		const traceId = this.traceIdDoItem(item);
		// Id determinístico do score por item: re-run da mesma conduta SOBRESCREVE
		// o score anterior (upsert por id) em vez de duplicar linha no mesmo run.
		const r = await this.pedir("POST", "/api/public/dataset-run-items", {
			datasetItemId,
			traceId,
			runName: this.runName,
			runDescription: this.runDescricao,
		});
		if (!r.ok) {
			this.falhar(`anexar item ${item.cenario}: ${r.detalhe}`);
			return;
		}
		// O id do run vem do primeiro item — os scores e o agregado dependem dele.
		const id = (r.dados as { datasetRunId?: string }).datasetRunId;
		if (id && !this.datasetRunId) this.datasetRunId = id;
		if (!this.datasetRunId) {
			this.falhar("run sem datasetRunId devolvido");
			return;
		}
		console.log(`${PREFIXO} item anexado: ${item.cenario} (run ${this.datasetRunId})`);
		for (const s of scores) {
			const rs = await this.pedir("POST", "/api/public/scores", {
				id: this.idDoScore(`${this.runName}:${item.datasetItemId}:${s.name}`),
				name: s.name,
				// A instância v4 aceita BOOLEAN só como 0/1, e a API exige exatamente
				// UMA âncora — aqui `datasetRunId` (+ `datasetItemId`); `traceId` junto
				// com `datasetRunId` é rejeitado ("Provide exactly one of...").
				value: typeof s.value === "boolean" ? (s.value ? 1 : 0) : s.value,
				dataType: s.dataType,
				comment: s.comment,
				datasetRunId: this.datasetRunId,
				...(item.datasetItemId ? { datasetItemId: item.datasetItemId } : {}),
			});
			if (!rs.ok) {
				// Falha de score NÃO desliga o gravador: o item e o resto dos scores seguem.
				console.error(`${PREFIXO} score ${s.name} de ${item.cenario} não gravado (${rs.detalhe}).`);
			}
		}
	}

	/** Score agregado por run — pass rate da trajetória. Id determinístico:
	 *  re-run da mesma conduta SOBRESCREVE o agregado anterior (upsert por id);
	 *  o comentário registra a rodada (quantas execuções já chegaram ao run). */
	async agregado(args: {
		name: string;
		value: number;
		dataType: "NUMERIC";
		comment: string;
	}): Promise<void> {
		if (this.morto || !this.datasetRunId) return;
		const rodada = await this.rodadasDe(args.name);
		const r = await this.pedir("POST", "/api/public/scores", {
			id: this.idDoScore(`${this.runName}:${args.name}`),
			...args,
			comment: rodada > 1 ? `${args.comment} · rodada ${rodada}` : args.comment,
			datasetRunId: this.datasetRunId,
		});
		if (!r.ok) console.error(`${PREFIXO} score agregado não gravado (${r.detalhe}).`);
		else
			console.log(
				`${PREFIXO} run ${this.datasetRunId} (${this.runName}) gravado — comparável na UI do Langfuse.`,
			);
	}

	/** Count de scores deste nome no run atual — é a rodada anterior. Falha
	 *  de leitura não bloqueia: devolve 1 (comentário fica sem número de rodada).
	 *  LIMITAÇÃO (sondado 05/11/2026): na instância v4 events_only, GET
	 *  /api/public/scores está desativado e GET /api/public/v3/scores rejeita
	 *  `datasetRunId` — o número de rodada não é legível de volta. O upsert por
	 *  id determinístico continua provado (o POST com o mesmo `id` devolve o
	 *  mesmo id e atualiza em vez de duplicar). */
	private async rodadasDe(name: string): Promise<number> {
		const r = await this.pedir(
			"GET",
			`/api/public/scores?datasetRunId=${this.datasetRunId}&name=${encodeURIComponent(name)}&limit=1&page=1`,
		);
		const total = (r.dados as { meta?: { totalItems?: number } } | undefined)?.meta?.totalItems;
		return typeof total === "number" && total > 0 ? total + 1 : 1;
	}

	/** Id determinístico de score (24 hex de sha256) — a âncora do upsert. */
	private idDoScore(semente: string): string {
		return createHash("sha256").update(semente).digest("hex").slice(0, 24);
	}

	private traceIdDoItem(item: ItemDoRun): string {
		const slug = item.cenario.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80);
		// Traço sintético do item: a instância v4 é events_only e não expõe o
		// traceId real ao runner; o vínculo comparável vem de datasetRunId+datasetItemId.
		return `eval-${this.runName}-${slug}`;
	}
}
