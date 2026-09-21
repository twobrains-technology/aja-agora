// Handler do LangChain por TURNO (nunca global — handler global vazaria
// contexto entre turnos concorrentes). Os atributos do trace
// (sessionId/userId/tags) já vêm do withLangfuseTurn via updateActiveTrace;
// o handler só liga as generations/chains do LangChain no trace ativo.
//
// Duas correções moram aqui, e as duas são no FECHAMENTO da observação — o
// único ponto em que o app enxerga o span antes de ele virar dado no Langfuse:
//
//  1. `GraphInterrupt` NÃO é erro. O nó `human` (graph.ts) pausa o grafo a cada
//     turno com `interrupt("aguardando-resposta-do-usuario")`, e o LangGraph
//     entrega essa pausa ao callback como `on_chain_error` — o `CallbackHandler`
//     do Langfuse carimba `level=ERROR` no step `human` em 100% dos turnos
//     (medido em produção: trace `0208e0e6`, `87293497`, `ba4dbe6f`). Alerta
//     que grita em todo turno é alerta que ninguém lê. O app JÁ sabia
//     distinguir essa pausa, mas só no dossiê do alerta
//     (`alerta/dossie.ts`, filtro por `statusMessage`); aqui a mesma distinção
//     vale para o TRACE.
//  2. A geração precisa dizer QUAL modelo falou. Sem isso o turno não é
//     atribuível a modelo nenhum no Langfuse. O caminho do SDK é ler
//     `invocation_params.model`; quando o provider não o entrega, o app cai no
//     que o próprio modelo carrega (`ls_model_name` / `kwargs.model`) em vez de
//     gravar `model: null`.
//
// Lei herdada do turn.ts: observabilidade NUNCA derruba o turno. O
// `CallbackHandler` base já engole erro interno; os overrides mantêm a regra.
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { CallbackHandler } from "@langfuse/langchain";
import { isLangfuseConfigured } from "./env";

/** Assinatura da pausa do grafo. É a MESMA marca que o dossiê do alerta usa
 *  (`alerta/dossie.ts`: `statusMessage.includes("GraphInterrupt")`) — uma
 *  pausa normal do funil, não falha. */
const MARCA_DE_PAUSA = "GraphInterrupt";

/** O erro que o LangGraph entrega ao callback é a pausa `interrupt()`? Nunca
 *  lança: `String(err)` de um objeto exótico não pode derrubar o turno. */
function ehPausaDoGrafo(err: unknown): boolean {
	try {
		return String(err).includes(MARCA_DE_PAUSA);
	} catch {
		return false;
	}
}

type ArgsDaGeracao = Parameters<CallbackHandler["handleGenerationStart"]>;
type ArgsDoErroDeChain = Parameters<CallbackHandler["handleChainError"]>;

/** Nome do modelo que FALOU, na ordem em que o LangChain o expõe:
 *  1. `invocation_params.model` — o que o provider manda para a API;
 *  2. `metadata.ls_model_name` — o carimbo do próprio modelo no run;
 *  3. `kwargs.model` do modelo serializado — o que o `toJSON()` carrega.
 *  Sem nenhum dos três, `null`: melhor não afirmar modelo nenhum. */
export function nomeDoModeloDaGeracao(
	llm: unknown,
	extraParams?: Record<string, unknown> | null,
	metadata?: Record<string, unknown> | null,
): string | null {
	const daInvocacao = (extraParams?.invocation_params as { model?: unknown } | undefined)?.model;
	if (typeof daInvocacao === "string" && daInvocacao.trim()) return daInvocacao.trim();
	const doCarimbo = metadata?.ls_model_name;
	if (typeof doCarimbo === "string" && doCarimbo.trim()) return doCarimbo.trim();
	const doModelo = (llm as { kwargs?: { model?: unknown } } | null)?.kwargs?.model;
	if (typeof doModelo === "string" && doModelo.trim()) return doModelo.trim();
	return null;
}

/** O `CallbackHandler` do Langfuse com os dois fechamentos corrigidos. */
class HandlerDoTurno extends CallbackHandler {
	async handleGenerationStart(...args: ArgsDaGeracao): Promise<void> {
		const [llm, messages, runId, parentRunId, extraParams, tags, metadata, name] = args;
		const nomeDoModelo = nomeDoModeloDaGeracao(llm, extraParams, metadata);
		if (!nomeDoModelo) return super.handleGenerationStart(...args);
		// O nome entra por onde o SDK lê (`invocation_params.model`) para não
		// depender de o provider preencher o metadata sozinho.
		const extraComModelo = {
			...(extraParams ?? {}),
			invocation_params: {
				...((extraParams?.invocation_params as object | undefined) ?? {}),
				model: nomeDoModelo,
			},
		};
		return super.handleGenerationStart(
			llm,
			messages,
			runId,
			parentRunId,
			extraComModelo,
			tags,
			metadata,
			name,
		);
	}

	async handleChainError(...args: ArgsDoErroDeChain): Promise<void> {
		const [err, runId, parentRunId] = args;
		if (!ehPausaDoGrafo(err)) return super.handleChainError(...args);
		// Pausa do `human`: fecha o span como FIM NORMAL (sem `level: ERROR`).
		return super.handleChainEnd({}, runId, parentRunId);
	}
}

export function makeLangfuseCallbackHandler(): BaseCallbackHandler | undefined {
	if (!isLangfuseConfigured()) return undefined;
	try {
		return new HandlerDoTurno() as unknown as BaseCallbackHandler;
	} catch (err) {
		console.error("[langfuse] CallbackHandler falhou — turno segue sem spans LangChain:", err);
		return undefined;
	}
}
