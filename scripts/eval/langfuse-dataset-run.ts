// ── B10 — Dataset run do `pnpm eval` na instância Langfuse ───────────────
//
// O runner continua sendo O GATE (`scripts/eval-run.ts`); com `--dataset-run`
// ele além do relatório local grava o run na instância Langfuse: um run novo
// por execução (não é idempotente por desenho — cada execução é uma rodada
// nova), cada cenário executado vira um item do run, e cada item recebe
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
//     runs ficam comparáveis side-by-side na UI.
//
// Lei da casa (plano B10 e premissa): falha de Langfuse NUNCA quebra o eval —
// todo método engole erro com log e desliga o gravador na primeira falha
// fatal; sem credenciais, o gravador nem liga. Nada aqui altera o veredito.

import { execFileSync } from "node:child_process";

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
			// 2. o run nasce IMPLÍCITO no primeiro item — aqui só se garante que o
			//    `runName` é único desta execução (nome + timestamp já o são) e que
			//    os endpoints que o item usa respondem. O id do run devolvido pelo
			//    primeiro item fica no recorde.
			const rec = new DatasetRunRecorder({ ...c, baseUrl }, "");
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
			return { ok: true, dados: json };
		} catch (e) {
			return { ok: false, detalhe: `${caminho}: ${e instanceof Error ? e.message : e}` };
		}
	}

	private falhar(detalhe: string): void {
		this.morto = true;
		console.error(`${PREFIXO} falha fatal (resto da execução segue SEM dataset run): ${detalhe}`);
	}

	/** Mapa cenário golden → datasetItemId, lido do `metadata.golden` dos itens. */
	async itensPorCenario(): Promise<Map<string, string>> {
		const mapa = new Map<string, string>();
		let pagina = 1;
		for (;;) {
			const r = await this.pedir(
				"GET",
				`/api/public/dataset-items?datasetName=${NOME_DO_DATASET}&page=${pagina}&limit=50`,
			);
			if (!r.ok) {
				console.error(
					`${PREFIXO} não conseguiu ler itens do dataset (${r.detalhe}) — itens não serão vinculados.`,
				);
				return mapa;
			}
			const dados =
				(r.dados as { data?: Array<{ id?: string; metadata?: { golden?: string[] } }> }).data ?? [];
			for (const item of dados) {
				if (!item.id) continue;
				for (const cenario of item.metadata?.golden ?? []) {
					if (!mapa.has(cenario)) mapa.set(cenario, item.id);
				}
			}
			if (dados.length < 50) break;
			pagina += 1;
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

	/** Score agregado por run — pass rate da trajetória. */
	async agregado(args: {
		name: string;
		value: number;
		dataType: "NUMERIC";
		comment: string;
	}): Promise<void> {
		if (this.morto || !this.datasetRunId) return;
		const r = await this.pedir("POST", "/api/public/scores", {
			...args,
			datasetRunId: this.datasetRunId,
		});
		if (!r.ok) console.error(`${PREFIXO} score agregado não gravado (${r.detalhe}).`);
		else
			console.log(
				`${PREFIXO} run ${this.datasetRunId} (${this.runName}) gravado — comparável na UI do Langfuse.`,
			);
	}

	private traceIdDoItem(item: ItemDoRun): string {
		const slug = item.cenario.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80);
		// Traço sintético do item: a instância v4 é events_only e não expõe o
		// traceId real ao runner; o vínculo comparável vem de datasetRunId+datasetItemId.
		return `eval-${this.runName}-${slug}`;
	}
}
