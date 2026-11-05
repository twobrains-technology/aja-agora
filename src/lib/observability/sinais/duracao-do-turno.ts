// DURAÇÃO DO TURNO — latência persistida no livro-caixa (`uso_de_ia`).
//
// ## Por que um job e não instrumentação no stream
//
// O TTFT de verdade nasce no streaming (`completionStartTime` da generation), e
// instrumentar o streaming do vendedor tocaria `turno-livre.ts` — PROIBIDO nesta
// campanha (outra worktree, D-0080, o reescreve). O caminho adotado é o de
// reconciliação: a DURAÇÃO vem da fonte local que já existe (o `durationMs` do
// `TurnTraceRecord`, wall-clock do turno inteiro — pré-LLM incluído), e o TTFT é
// lido DA GENERATION que o plugin `@langfuse/pi-observability-plugin` (0.1.2) já
// grava no Langfuse, via `/api/public/v2/observations?traceId=<id>`.
//
// ## PENDENTE-BLOCO (TTFT)
//
// Se a generation 0.1.2 não expuser `completionStartTime` no payload da API, o
// `ttft_ms` fica NULO — preenchível só quando um plugin novo trouxer o campo.
// A DURAÇÃO continua sendo persistida de todo jeito (é computável do histórico
// local, que a fonte local já entrega). Registrado no diário (`.orientacao/diario.md`).
//
// ## Leis que não mudam
//
// Observabilidade NUNCA derruba o turno: sem envs de Langfuse = no-op; falha de
// rede, de parse ou de banco é engolida e logada. Sem `LANGFUSE_TRACING_ENABLED`
// + chaves, nem uma linha é tocada — o mesmo gate de `pi/langfuse.ts`.
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { usoDeIa } from "@/db/schema";
import { configDoLangfuse } from "@/lib/agent/pi/langfuse";

/** O que o turno local já sabe — o mínimo do `TurnTraceRecord`. */
export type DuracaoDoTurno = {
	traceId: string;
	conversationId: string;
	/** Wall-clock do turno (ms) do `TurnTraceRecord`. `null` = não veio. */
	durationMs: number | null;
};

/** Uma observation do payload da API v2 — só o que o cálculo usa. */
export type ObservationDoLangfuse = {
	type: string | null;
	startTime: string | null;
	endTime: string | null;
	completionStartTime: string | null;
};

/** Epoch ms de um timestamp ISO da API; inválido/ausente é `null`. */
function instante(iso: string | null | undefined): number | null {
	if (typeof iso !== "string" || iso.length === 0) return null;
	const t = Date.parse(iso);
	return Number.isFinite(t) ? t : null;
}

/** Ms reportado como inteiro ≥ 0; ausente, negativo ou não numérico é `null`. */
function ms(valor: number | null | undefined): number | null {
	if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
	return Math.max(0, Math.round(valor)) > 0 ? Math.round(valor) : null;
}

/**
 * O TTFT de uma lista de observations: o `completionStartTime - startTime` da
 * generation que o reporta. Última generation com o campo vence (o turno pode ter
 * mais de um beat; o plugin grava um span por chamada de LLM). Sem o campo em
 * nenhuma, `null` — nunca 0: "não medido" não é "instantâneo".
 */
export function ttftDasObservations(observations: readonly ObservationDoLangfuse[]): number | null {
	for (let i = observations.length - 1; i >= 0; i--) {
		const obs = observations[i];
		if (obs.type !== "GENERATION") continue;
		const inicio = instante(obs.startTime);
		const primeiroToken = instante(obs.completionStartTime);
		if (inicio === null || primeiroToken === null || primeiroToken < inicio) continue;
		return ms(primeiroToken - inicio);
	}
	return null;
}

/**
 * A duração do turno pelas observations — o fallback quando o registro local não
 * trouxe `durationMs`: o span do primeiro ao último instante reportado. Sem
 * instante nenhum, `null`.
 */
export function duracaoDasObservations(
	observations: readonly ObservationDoLangfuse[],
): number | null {
	const instantes: number[] = [];
	for (const obs of observations) {
		for (const iso of [obs.startTime, obs.endTime, obs.completionStartTime]) {
			const t = instante(iso);
			if (t !== null) instantes.push(t);
		}
	}
	if (instantes.length === 0) return null;
	return ms(Math.max(...instantes) - Math.min(...instantes));
}

/** O payload da rota de observations da API v2. */
type RespostaDeObservations = { data?: ObservationDoLangfuse[] | null };

/**
 * Lê as generations do turno no Langfuse e grava `duracao_ms`/`ttft_ms` na linha
 * de `uso_de_ia` do turno.
 *
 * A linha é a mais recente da conversa sem `duracao_ms` — o turno grava UMA linha
 * por turno (`pi/turno-livre.ts`), e a reconciliação roda depois dele. Linha já
 * preenchida não é regravada: quem chegou primeiro venceu.
 *
 * Nunca lança. Sem envs de Langfuse, nem consulta faz.
 */
export async function registrarDuracaoDoTurno(
	turno: DuracaoDoTurno,
	deps: { fetch?: typeof fetch } = {},
): Promise<void> {
	const config = configDoLangfuse();
	if (!config) return;
	try {
		const observacoes = await observationsDoTurno(turno.traceId, config, deps);
		if (!observacoes) return;
		const ttftMs = ttftDasObservations(observacoes);
		const duracaoMs = ms(turno.durationMs) ?? duracaoDasObservations(observacoes);
		if (duracaoMs === null && ttftMs === null) return;

		const [linha] = await db
			.select({ id: usoDeIa.id })
			.from(usoDeIa)
			.where(and(eq(usoDeIa.conversationId, turno.conversationId), isNull(usoDeIa.duracaoMs)))
			.orderBy(desc(usoDeIa.criadoEm))
			.limit(1);
		if (!linha) return;

		await db.update(usoDeIa).set({ duracaoMs, ttftMs }).where(eq(usoDeIa.id, linha.id));
	} catch (erro) {
		console.error("[duracao-do-turno] latência não reconciliada (ignorado):", erro);
	}
}

async function observationsDoTurno(
	traceId: string,
	config: NonNullable<ReturnType<typeof configDoLangfuse>>,
	deps: { fetch?: typeof fetch },
): Promise<ObservationDoLangfuse[] | null> {
	const url = new URL("/api/public/v2/observations", config.baseUrl);
	url.searchParams.set("traceId", traceId);
	const resposta = await (deps.fetch ?? fetch)(url, {
		headers: {
			Authorization: `Basic ${Buffer.from(
				`${config.publicKey}:${config.secretKey}`,
			).toString("base64")}`,
		},
		signal: AbortSignal.timeout(10_000),
	});
	if (!resposta.ok) {
		console.error(
			`[duracao-do-turno] observations indisponíveis (${resposta.status}) — ttft fica nulo`,
		);
		return null;
	}
	const corpo = (await resposta.json()) as RespostaDeObservations;
	return corpo.data ?? null;
}
