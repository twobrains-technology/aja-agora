// ANNOTATION QUEUE — bloco B14 do plano
// `docs/design/planos/2026-11-05-langfuse-suíte.md`.
//
// Cria a fila de calibração do juiz (`calibracao-juiz`) na instância e enfileira
// os traces marcados pelos detectores determinísticos:
// - `numero_fora_da_cota` — número dito que não bate com a cota/carta;
// - `promessa_sem_fato` — promessa sem lastro em ferramenta;
// - `retomada_sem_novidade` — retomada que repete o mesmo pedido sem levar algo
//   novo (D-0083, bloco B: morte do lead).
//
// Enfileira TAMBÉM os cenários de morte por sessão (independem de score):
// os 3 perfis de morte da simulação (`voltei-sem-nada`, `silencio-total`,
// `card-travado`) e os golden `golden-real-voltei-sem-conteudo`,
// `golden-real-remarketing-identico`. A fonte dos ids é LOCAL: os exports da
// simulação (`simulacao-*.json`, com `conversationId` por turno) e o relatório
// do gate mais recente (`.eval/relatorio-gate-*.json`, campo `conversationId`
// por cenário). No Langfuse, cada turno do app vira um trace cujo `sessionId`
// é o `conversationId` (plugin do Pi) — enfileirar a SESSION traz todos os
// turnos do cenário de uma vez.
//
// Os detectores gravam esses scores como BOOLEAN no trace do turno
// (`src/lib/observability/sinais/numero-fora-da-cota.ts`,
// `promessa-sem-fato.ts`). A API de scores aceita filtro por valor:
// `GET /api/public/v3/scores?name=<score>&value=true&dataType=BOOLEAN`
// (sondado contra a instância em 05/11/2026 — sem `dataType` o filtro
// responde erro; para BOOLEAN o valor tem de ser `true`/`false`).
//
// Idempotente: `GET /api/public/annotation-queues` primeiro (cria só se o nome
// não existe) e os itens já presentes na fila não entram de novo.
// Credenciais: ambiente, depois cofre (`secrets.sh get-key
// pi-agentes-aja-langfuse <CHAVE>`), mesmo mecanismo de
// `scripts/langfuse-score-configs.ts`. Nada aqui imprime chave.
//
// GATE: `pnpm tsx scripts/langfuse-annotation-queue.ts` → fila na UI; se
// houver scores reais dos detectores, itens enfileirados. Sem scores ainda,
// o run prova a fila e o enfileiramento fica PENDENTE de dados.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { credenciais, listarScoreConfigs } from "./langfuse-score-configs";

type Credenciais = { baseUrl: string; publicKey: string; secretKey: string };

/** Nomes dos score configs que a fila pende — o juiz pontua na fila de
 * calibração. Os ids são resolvidos contra a instância no momento do uso. */
const SCORE_CONFIGS_DA_FILA = ["numero_fora_da_cota", "promessa_sem_fato", "retomada_sem_novidade"];

const NOME_DA_FILA = "calibracao-juiz";
const DESCRICAO_DA_FILA =
	"Fila de calibração do juiz: traces marcados pelos detectores determinísticos (numero_fora_da_cota, promessa_sem_fato, retomada_sem_novidade) e sessões dos cenários de morte (perfis de morte da simulação + golden-real-voltei-sem-conteudo, golden-real-remarketing-identico) para o Kairo julgar. O veredito do juiz nunca é gate — aqui é material de calibração.";

/** Os perfis de morte da simulação (bloco B) — o lead volta sem dar nada,
 * silencia e retorna, trava no card. */
export const PERFIS_DE_MORTE = ["voltei-sem-nada", "silencio-total", "card-travado"] as const;

/** Os golden de retomada — conversa real gravada onde o lead volta sem
 * conteúdo e onde o remarketing devolve a mesma fala de antes. */
export const GOLDEN_DE_MORTE = [
	"golden-real-voltei-sem-conteudo",
	"golden-real-remarketing-identico",
] as const;

type Fila = {
	id: string;
	name: string;
	description: string | null;
	scoreConfigIds: string[];
};

type RespostaLista<T> = { data?: T[]; meta?: { page?: number; totalPages?: number } };

function autorizacao(cred: Credenciais): string {
	return `Basic ${Buffer.from(`${cred.publicKey}:${cred.secretKey}`).toString("base64")}`;
}

function url(cred: Credenciais, caminho: string): string {
	return cred.baseUrl.replace(/\/$/, "") + caminho;
}

async function pedir(
	fetchFn: typeof fetch,
	cred: Credenciais,
	caminho: string,
	init?: RequestInit,
): Promise<Response> {
	return fetchFn(url(cred, caminho), {
		...init,
		headers: { Authorization: autorizacao(cred), ...(init?.headers ?? {}) },
		signal: AbortSignal.timeout(15_000),
	});
}

export async function listarFilas(fetchFn: typeof fetch, cred: Credenciais): Promise<Fila[]> {
	const filas: Fila[] = [];
	let page = 1;
	for (;;) {
		const resposta = await pedir(
			fetchFn,
			cred,
			`/api/public/annotation-queues?page=${page}&limit=50`,
		);
		if (!resposta.ok) {
			throw new Error(
				`GET /api/public/annotation-queues (página ${page}) → HTTP ${resposta.status}`,
			);
		}
		const corpo = (await resposta.json()) as RespostaLista<Fila>;
		filas.push(...(corpo.data ?? []));
		const total = corpo.meta?.totalPages ?? 1;
		if (page >= total) return filas;
		page += 1;
	}
}

export async function criarFila(
	fetchFn: typeof fetch,
	cred: Credenciais,
	scoreConfigIds: string[],
): Promise<Fila> {
	const resposta = await pedir(fetchFn, cred, "/api/public/annotation-queues", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			name: NOME_DA_FILA,
			description: DESCRICAO_DA_FILA,
			scoreConfigIds,
		}),
	});
	if (!resposta.ok) {
		throw new Error(`POST /api/public/annotation-queues → HTTP ${resposta.status}`);
	}
	return (await resposta.json()) as Fila;
}

export async function garantirFila(
	fetchFn: typeof fetch,
	cred: Credenciais,
	scoreConfigIds: string[],
): Promise<{ fila: Fila; criada: boolean }> {
	const existentes = await listarFilas(fetchFn, cred);
	const achada = existentes.find((f) => f.name === NOME_DA_FILA);
	if (achada) return { fila: achada, criada: false };
	return { fila: await criarFila(fetchFn, cred, scoreConfigIds), criada: true };
}

/** Um trace marcado por um detector: o score BOOLEAN `true` sobre o trace. */
export type TraceMarcado = {
	/** Id do trace no Langfuse. */
	traceId: string | null;
	/** Id da session, quando o score foi por sessão. */
	sessionId: string | null;
};

type ScoreV3 = {
	id: string;
	name: string;
	value: string | number | boolean;
	traceId?: string | null;
	sessionId?: string | null;
};

/** Busca os traces marcados pelo detector: scores `true` do nome dado.
 * Sem `dataType=BOOLEAN` + `value=true` a API rejeita o filtro — sondado. */
export async function listarMarcados(
	fetchFn: typeof fetch,
	cred: Credenciais,
	nomeDoScore: string,
): Promise<TraceMarcado[]> {
	const marcados: TraceMarcado[] = [];
	let cursor: string | undefined;
	for (;;) {
		const resposta = await pedir(
			fetchFn,
			cred,
			`/api/public/v3/scores?name=${encodeURIComponent(nomeDoScore)}&value=true&dataType=BOOLEAN&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
		);
		if (!resposta.ok) {
			throw new Error(
				`GET /api/public/v3/scores?name=${nomeDoScore}&value=true → HTTP ${resposta.status}`,
			);
		}
		const corpo = (await resposta.json()) as RespostaLista<ScoreV3> & {
			meta?: { cursor?: string };
		};
		for (const score of corpo.data ?? []) {
			marcados.push({ traceId: score.traceId ?? null, sessionId: score.sessionId ?? null });
		}
		cursor = corpo.meta?.cursor;
		if (!cursor) break;
	}
	// O mesmo trace pode ter mais de um score do mesmo detector: entra uma vez só.
	const vistos = new Set<string>();
	return marcados.filter((m) => {
		const chave = m.traceId ?? `session:${m.sessionId}`;
		if (!m.traceId && !m.sessionId) return false;
		if (vistos.has(chave)) return false;
		vistos.add(chave);
		return true;
	});
}

/** Enfileira um trace: `POST /api/public/annotation-queues/<id>/items`. */
export async function enfileirar(
	fetchFn: typeof fetch,
	cred: Credenciais,
	filaId: string,
	marcado: TraceMarcado,
): Promise<{ status: number; ok: boolean }> {
	const corpo = marcado.traceId
		? { traceId: marcado.traceId, objectId: marcado.traceId, objectType: "TRACE" }
		: { objectId: marcado.sessionId, objectType: "SESSION" };
	const resposta = await pedir(fetchFn, cred, `/api/public/annotation-queues/${filaId}/items`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(corpo),
	});
	return { status: resposta.status, ok: resposta.ok };
}

type ItemDaFila = {
	objectId: string;
	objectType: string;
};

/** Itens já na fila — o re-run não duplica. */
export async function itensDaFila(
	fetchFn: typeof fetch,
	cred: Credenciais,
	filaId: string,
): Promise<Set<string>> {
	const itens = new Set<string>();
	let page = 1;
	for (;;) {
		const resposta = await pedir(
			fetchFn,
			cred,
			`/api/public/annotation-queues/${filaId}/items?page=${page}&limit=100`,
		);
		if (!resposta.ok) {
			throw new Error(
				`GET /api/public/annotation-queues/${filaId}/items (página ${page}) → HTTP ${resposta.status}`,
			);
		}
		const corpo = (await resposta.json()) as RespostaLista<ItemDaFila>;
		for (const item of corpo.data ?? []) itens.add(item.objectId);
		const total = corpo.meta?.totalPages ?? 1;
		if (page >= total) return itens;
		page += 1;
	}
}

// ── cenários de morte: sessões lidas dos registros locais ─────────────

export type SessaoDeMorte = { sessionId: string; fonte: string };

type ExportacaoSimulacao = {
	resultados?: Array<{
		perfilId?: string;
		turnos?: Array<{ vendedor?: { conversationId?: string | null } }>;
	}>;
};

/** Lê `simulacao-*.json` (exportações da simulação, em `dir` e `dir/.eval`) e
 * devolve os conversationIds dos turnos dos perfis de morte. Arquivo que não
 * abre ou que não casa com o formato é pulado — o registro é acessório, a fila
 * nunca falha por causa dele. */
export function sessoesDeMorteDaSimulacao(dir: string): SessaoDeMorte[] {
	const achados = new Map<string, string>();
	for (const pasta of [dir, join(dir, ".eval")]) {
		let arquivos: string[];
		try {
			arquivos = readdirSync(pasta).filter(
				(f) => f.startsWith("simulacao-") && f.endsWith(".json"),
			);
		} catch {
			continue;
		}
		for (const arquivo of arquivos) {
			let corpo: ExportacaoSimulacao;
			try {
				corpo = JSON.parse(readFileSync(join(pasta, arquivo), "utf8")) as ExportacaoSimulacao;
			} catch {
				continue;
			}
			for (const r of corpo.resultados ?? []) {
				if (!r.perfilId || !(PERFIS_DE_MORTE as readonly string[]).includes(r.perfilId)) continue;
				for (const t of r.turnos ?? []) {
					const cid = t.vendedor?.conversationId;
					if (cid) achados.set(cid, `${pasta}/${arquivo} (perfil ${r.perfilId})`);
				}
			}
		}
	}
	return [...achados].map(([sessionId, fonte]) => ({ sessionId, fonte }));
}

/** Lê o relatório do gate mais recente (`.eval/relatorio-gate-*.json`) e
 * devolve as sessões dos golden de morte que rodaram nele. */
export function sessoesDeMorteDoGate(dir: string): SessaoDeMorte[] {
	const pasta = join(dir, ".eval");
	let arquivos: string[];
	try {
		arquivos = readdirSync(pasta).filter(
			(f) => f.startsWith("relatorio-gate-") && f.endsWith(".json"),
		);
	} catch {
		return [];
	}
	if (arquivos.length === 0) return [];
	// O mais recente por mtime — o gate de agora, não um velho.
	let maisNovo: { f: string; m: number } | null = null;
	for (const f of arquivos) {
		try {
			const m = statSync(join(pasta, f)).mtimeMs;
			if (!maisNovo || m > maisNovo.m) maisNovo = { f, m };
		} catch {}
	}
	if (!maisNovo) return [];
	let corpo: { cenarios?: Array<{ cenario?: string; conversationId?: string }> };
	try {
		corpo = JSON.parse(readFileSync(join(pasta, maisNovo.f), "utf8"));
	} catch {
		return [];
	}
	const achados: SessaoDeMorte[] = [];
	for (const c of corpo.cenarios ?? []) {
		if (!c.cenario || !(GOLDEN_DE_MORTE as readonly string[]).includes(c.cenario)) continue;
		if (!c.conversationId) continue;
		achados.push({ sessionId: c.conversationId, fonte: `.eval/${maisNovo.f} (${c.cenario})` });
	}
	return achados;
}

export type ResultadoExecucao = {
	ok: boolean;
	motivo?: string;
	fila: { id: string; criada: boolean };
	/** Scores dos detectores ainda não existe — enfileiramento PENDENTE de dados. */
	enfileirados: number;
	jaNaFila: number;
	/** Sessões dos cenários de morte enfileiradas (perfis + golden). */
	enfileiradosDeMorte: number;
	fontesDeMorte: string[];
	pendenteDeDados: boolean;
};

export async function executar(
	env: Record<string, string | undefined> = process.env,
	lerCofre: (chave: string) => string | undefined = doCofre,
	fetchFn: typeof fetch = fetch,
	dir: string = process.cwd(),
): Promise<ResultadoExecucao> {
	const cred = credenciais(env, lerCofre);
	if (!cred) {
		throw new Error("sem credenciais no ambiente e no cofre — script não roda");
	}
	const ids = new Map<string, string>();
	const configs = await listarScoreConfigs(fetchFn, cred);
	for (const nome of SCORE_CONFIGS_DA_FILA) {
		const achada = configs.find((c) => c.name === nome);
		if (achada) ids.set(nome, achada.id);
	}
	const faltando = SCORE_CONFIGS_DA_FILA.filter((n) => !ids.has(n));
	if (faltando.length > 0) {
		throw new Error(
			`score configs ausentes na instância: ${faltando.join(", ")} — rode scripts/langfuse-score-configs.ts antes`,
		);
	}
	const { fila, criada } = await garantirFila(fetchFn, cred, [...ids.values()]);
	const presentes = await itensDaFila(fetchFn, cred, fila.id);
	let enfileirados = 0;
	let jaNaFila = 0;
	let achouScore = false;
	for (const nome of SCORE_CONFIGS_DA_FILA) {
		const marcados = await listarMarcados(fetchFn, cred, nome);
		if (marcados.length > 0) achouScore = true;
		for (const marcado of marcados) {
			const chave = marcado.traceId ?? `session:${marcado.sessionId}`;
			if (presentes.has(chave)) {
				jaNaFila += 1;
				continue;
			}
			const { ok, status } = await enfileirar(fetchFn, cred, fila.id, marcado);
			if (!ok) throw new Error(`POST items para ${chave} → HTTP ${status}`);
			presentes.add(chave);
			enfileirados += 1;
		}
	}
	// Cenários de morte: a fila também leva os registros locais — os perfis de
	// morte da simulação e os golden de retomada — enfileirados por SESSÃO
	// (todos os turnos do cenário entram de uma vez, com ou sem score de detector).
	const deMorte = [...sessoesDeMorteDaSimulacao(dir), ...sessoesDeMorteDoGate(dir)];
	let enfileiradosDeMorte = 0;
	const fontesDeMorte: string[] = [];
	for (const sessao of deMorte) {
		// itens de SESSION na fila carregam o objectId cru — aceita as duas formas
		// na dedup (com e sem o prefixo de chave interna).
		if (presentes.has(`session:${sessao.sessionId}`) || presentes.has(sessao.sessionId)) {
			jaNaFila += 1;
			continue;
		}
		const { ok, status } = await enfileirar(fetchFn, cred, fila.id, {
			traceId: null,
			sessionId: sessao.sessionId,
		});
		if (!ok) throw new Error(`POST items (sessão ${sessao.sessionId}) → HTTP ${status}`);
		presentes.add(sessao.sessionId);
		enfileiradosDeMorte += 1;
		fontesDeMorte.push(sessao.fonte);
	}
	return {
		ok: true,
		fila: { id: fila.id, criada },
		enfileirados,
		jaNaFila,
		enfileiradosDeMorte,
		fontesDeMorte,
		pendenteDeDados: !achouScore && enfileiradosDeMorte === 0,
	};
}

function doCofre(chave: string): string | undefined {
	try {
		const valor = execFileSync("secrets.sh", ["get-key", "pi-agentes-aja-langfuse", chave], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return valor.length > 0 ? valor : undefined;
	} catch {
		return undefined;
	}
}

function ehProcessoPrincipal(): boolean {
	const alvo = process.argv[1];
	if (!alvo) return false;
	const alvoAbs = isAbsolute(alvo) ? alvo : resolve(alvo);
	return import.meta.url === `file://${alvoAbs}`;
}

if (ehProcessoPrincipal()) {
	void (async () => {
		try {
			const resultado = await executar();
			console.log(
				`fila ${NOME_DA_FILA}: id=${resultado.fila.id} ${resultado.fila.criada ? "criada" : "já existia"}`,
			);
			console.log(
				`itens: ${resultado.enfileirados} por detector, ${resultado.enfileiradosDeMorte} de morte, ${resultado.jaNaFila} já estavam na fila`,
			);
			for (const fonte of resultado.fontesDeMorte) console.log(`  morte     ${fonte}`);
			if (resultado.pendenteDeDados) {
				console.log(
					"nenhum score real dos detectores nem registro local de cenário de morte — enfileiramento PENDENTE de dados",
				);
			}
			process.exit(0);
		} catch (erro) {
			console.error(
				`[langfuse-annotation-queue] FALHOU: ${erro instanceof Error ? erro.message : String(erro)}`,
			);
			process.exit(1);
		}
	})();
}
