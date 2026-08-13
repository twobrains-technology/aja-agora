// Dossiê do alerta — o que transforma "uma métrica estourou" em algo acionável.
//
// O webhook do Monitor traz o veredito e a janela (`fromTimestamp`/
// `toTimestamp`), não os fatos: nome do monitor, severidade, permalink. Quem
// abre esse e-mail às 3 da manhã não quer saber que "tool_falhou passou de
// 0,2" — quer ver A CONVERSA: o que o cliente escreveu, o que o agente
// respondeu, que tool não rodou, em que gate o funil parou.
//
// Então este módulo pega a janela do alerta e RECONSTRÓI os turnos a partir da
// API do Langfuse, cruzando três consultas que a UI mostra em telas separadas:
//   • as observations raiz (`turn`) da janela — com `fields=io`, que é o que
//     traz a fala dos dois lados;
//   • as observations filhas de cada trace — de onde saem as tools chamadas,
//     as que falharam e o `level` de erro real;
//   • os scores por trace — o veredito determinístico (gate_afundado,
//     turno_mudo, tool_falhou) e o dos juízes.
//
// Nota de v4 (2026-08-11): `/api/public/traces`, `/api/public/sessions` e
// `/api/public/v2/scores` são 404. O que existe é `/api/public/v2/observations`
// (com `fields`) e `/api/public/v3/scores`. O filtro `sessionId` do endpoint de
// scores volta VAZIO na v4 — por isso os scores são buscados por `traceId`, um
// por turno, e não em lote por sessão.
import { ambienteLangfuse } from "@/lib/observability/langfuse/env";

/** O `payload` de um webhook `monitor-alert` (langfuse/packages/shared/src/
 *  features/monitors/types.ts → MonitorAlertSchema). Só os campos que usamos. */
export type AlertaDoMonitor = {
	monitorId: string;
	projectId: string;
	permalink?: string;
	dataPermalink?: string;
	message: { title: string; body: string };
	severity: string;
	timestamp: string;
	fromTimestamp: string;
	toTimestamp: string;
};

export type TurnoDoDossie = {
	traceId: string;
	observationId: string;
	sessionId: string | null;
	userId: string | null;
	canal: string;
	inicio: string;
	/** O que chegou ao agente. Pode ser a fala do cliente OU um directive do
	 *  servidor — a distinção importa e aparece em `entradaEhDirective`. */
	entrada: string;
	entradaEhDirective: boolean;
	saida: string;
	toolsChamadas: string[];
	toolsQueFalharam: string[];
	erros: string[];
	scores: Record<string, string | number>;
	url: string;
};

export type Dossie = {
	alerta: AlertaDoMonitor;
	turnos: TurnoDoDossie[];
	/** Turnos que o alerta cobre mas que ficaram de fora do corpo (teto de
	 *  tamanho). Vai dito no e-mail: silenciar corte é o que faz um relatório
	 *  parecer completo sem ser. */
	turnosOmitidos: number;
	baseUrl: string;
};

/** Teto de turnos no corpo do e-mail. Alerta com 200 turnos não é lido. */
const TETO_DE_TURNOS = 12;

const DIRECTIVE = "[instrução do sistema";

type ClienteLangfuse = {
	baseUrl: string;
	auth: string;
	projectId: string;
};

function cliente(projectId: string): ClienteLangfuse | null {
	const baseUrl = process.env.LANGFUSE_BASE_URL;
	const pk = process.env.LANGFUSE_PUBLIC_KEY;
	const sk = process.env.LANGFUSE_SECRET_KEY;
	if (!baseUrl || !pk || !sk) return null;
	return {
		baseUrl: baseUrl.replace(/\/$/, ""),
		auth: Buffer.from(`${pk}:${sk}`).toString("base64"),
		projectId,
	};
}

async function buscar<T>(c: ClienteLangfuse, caminho: string): Promise<T | null> {
	try {
		const res = await fetch(`${c.baseUrl}${caminho}`, {
			headers: { Authorization: `Basic ${c.auth}` },
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) {
			console.error(`[alerta] Langfuse ${caminho} → HTTP ${res.status}`);
			return null;
		}
		return (await res.json()) as T;
	} catch (err) {
		console.error(`[alerta] Langfuse ${caminho} falhou:`, err);
		return null;
	}
}

type ObservationApi = {
	id: string;
	traceId: string;
	name?: string | null;
	type?: string | null;
	level?: string | null;
	statusMessage?: string | null;
	startTime: string;
	sessionId?: string | null;
	userId?: string | null;
	input?: unknown;
	output?: unknown;
	traceName?: string | null;
	tags?: string[] | null;
};

function texto(valor: unknown, limite = 1200): string {
	if (valor == null) return "";
	const s = typeof valor === "string" ? valor : JSON.stringify(valor);
	return s.length > limite ? `${s.slice(0, limite)}…` : s;
}

/** `turn:web` / `turn:whatsapp` no nome do trace, ou a tag `channel:*`. */
export function canalDoTurno(o: { traceName?: string | null; tags?: string[] | null }): string {
	const porNome = /turn:(\w+)/.exec(o.traceName ?? "");
	if (porNome) return porNome[1];
	const porTag = (o.tags ?? []).find((t) => t.startsWith("channel:"));
	return porTag ? porTag.slice("channel:".length) : "desconhecido";
}

/**
 * Monta o dossiê. Nunca lança: alerta que falha ao montar ainda tem que sair
 * (o e-mail cai para o corpo mínimo, com o veredito e o permalink).
 */
export async function montarDossie(alerta: AlertaDoMonitor): Promise<Dossie> {
	const c = cliente(alerta.projectId);
	const baseUrl = c?.baseUrl ?? process.env.LANGFUSE_BASE_URL ?? "";
	const vazio: Dossie = { alerta, turnos: [], turnosOmitidos: 0, baseUrl };
	if (!c) return vazio;

	const params = new URLSearchParams({
		fromStartTime: alerta.fromTimestamp,
		toStartTime: alerta.toTimestamp,
		isRootObservation: "true",
		limit: "50",
		fields: "core,basic,time,io,trace_context",
	});
	// O ambiente do app é o mesmo que carimba os traces — sem isto, um alerta de
	// produção viria misturado com trace de dev na mesma instância.
	params.append("environment", ambienteLangfuse());

	const lista = await buscar<{ data: ObservationApi[] }>(
		c,
		`/api/public/v2/observations?${params.toString()}`,
	);
	const raizes = (lista?.data ?? []).filter((o) => (o.name ?? "").startsWith("turn"));
	raizes.sort((a, b) => a.startTime.localeCompare(b.startTime));

	const selecionados = raizes.slice(0, TETO_DE_TURNOS);
	const turnos = await Promise.all(
		selecionados.map((raiz) => detalharTurno(c, raiz, baseUrl, alerta.projectId)),
	);

	return {
		alerta,
		turnos,
		turnosOmitidos: Math.max(0, raizes.length - selecionados.length),
		baseUrl,
	};
}

async function detalharTurno(
	c: ClienteLangfuse,
	raiz: ObservationApi,
	baseUrl: string,
	projectId: string,
): Promise<TurnoDoDossie> {
	const [filhas, scores] = await Promise.all([
		buscar<{ data: ObservationApi[] }>(
			c,
			`/api/public/v2/observations?traceId=${raiz.traceId}&limit=200&fields=core,basic,time`,
		),
		buscar<{ data: { name: string; value?: number | null; stringValue?: string | null }[] }>(
			c,
			`/api/public/v3/scores?traceId=${raiz.traceId}&limit=100`,
		),
	]);

	const obs = filhas?.data ?? [];
	const toolsChamadas = [...new Set(obs.filter((o) => o.type === "TOOL").map((o) => o.name ?? ""))];
	// `GraphInterrupt` é human-in-the-loop, o fluxo NORMAL de esperar resposta do
	// cliente — entra em todo turno como level=ERROR. Incluí-lo faria o alerta
	// gritar em 100% dos turnos, que é o mesmo que não alertar.
	const erros = obs
		.filter((o) => o.level === "ERROR" && !(o.statusMessage ?? "").includes("GraphInterrupt"))
		.map((o) => `${o.name}: ${texto(o.statusMessage, 200)}`);

	const mapaScores: Record<string, string | number> = {};
	for (const s of scores?.data ?? []) {
		const v = s.stringValue ?? s.value;
		if (v != null) mapaScores[s.name] = v;
	}
	const toolsQueFalharam = String(mapaScores.tool_falha_nome ?? "")
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);

	const entrada = texto(raiz.input);

	return {
		traceId: raiz.traceId,
		observationId: raiz.id,
		sessionId: raiz.sessionId ?? null,
		userId: raiz.userId ?? null,
		canal: canalDoTurno(raiz),
		inicio: raiz.startTime,
		entrada,
		entradaEhDirective: entrada.includes(DIRECTIVE),
		saida: texto(raiz.output),
		toolsChamadas,
		toolsQueFalharam,
		erros,
		scores: mapaScores,
		url: `${baseUrl}/project/${projectId}/traces/${raiz.traceId}`,
	};
}
