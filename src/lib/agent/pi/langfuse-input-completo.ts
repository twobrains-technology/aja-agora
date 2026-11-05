// O INPUT COMPLETO NO TRACE — a camada NOSSA, antes (ou ao lado) do plugin.
//
// O plugin oficial `@langfuse/pi-observability-plugin` (0.1.2) grava como input
// da generation APENAS o prompt do turno truncado (`src/index.ts:666-684`:
// `lastPromptText` na primeira chamada, `pendingToolResults` nas seguintes). O
// system da caixa, o histórico da conversa e a definição das tools — o que o
// modelo de fato leu — não chegam ao trace. Patch no plugin não é publicável e
// morre no upgrade; a decisão do chefe é envelope NOSSO.
//
// Como anexa sem tocar no plugin: o plugin cria um provider OpenTelemetry
// isolado (NÃO registra o global, `createRuntime`) e o publica em
// `globalThis[Symbol.for("langfuse")]` — medido no `dist/index.mjs` da
// `@langfuse/tracing` 5.14.0: `getGlobalState()` usa `Symbol.for`, então
// QUALQUER instância do pacote (a do jiti que carrega o plugin, ou a nossa
// importada aqui) lê e escreve o MESMO estado. Basta o nosso hook rodar depois
// do `ensureRuntime()` do plugin — e ele roda: `before_provider_request` é
// sempre posterior ao `before_agent_start`. O pai vem das mesmas envs que o
// próprio plugin publica para os subagentes (`LANGFUSE_PI_PARENT_*`,
// `src/index.ts:571-582`), postas no `before_agent_start` e tiradas no fim do
// turno — dentro do turno elas estão válidas.
//
// Régua: `PI_LANGFUSE_MAX_CHARS` (teto default 40.000, o mesmo que o
// `caminhoDoPluginDoLangfuse` põe antes de o plugin carregar). E os dois
// invioláveis valem por inteiro: SEM envs, nada acontece; e qualquer falha aqui
// é engolida — observabilidade nunca derruba o turno.

import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { startObservation } from "@langfuse/tracing";

import { type Ambiente, langfuseLigado, MAX_CHARS_PADRAO } from "./langfuse";

const ENV_PARENT_TRACE_ID = "LANGFUSE_PI_PARENT_TRACE_ID";
const ENV_PARENT_SPAN_ID = "LANGFUSE_PI_PARENT_SPAN_ID";
const ENV_PARENT_SESSION_ID = "LANGFUSE_PI_PARENT_SESSION_ID";

const HEX_TRACE_ID = /^[0-9a-f]{32}$/;
const HEX_SPAN_ID = /^[0-9a-f]{16}$/;

export const NOME_DA_OBSERVACAO = "LLM Call — Input Completo";

/** `{ system, historico, tools }` extraído do payload que o Pi manda ao
 *  provedor (formato OpenAI-completions), ou `null` quando o payload não é o
 *  esperado — aí não há o que anexar e o turno segue. */
export type EntradaCompleta = {
	system: string | null;
	historico: string;
	tools: string;
} | null;

/** O texto de um `content` de mensagem OpenAI: string direta, ou a junta dos
 *  parts `text` (o que sobrar de outro tipo vira JSON — nada se perde em silêncio). */
export function textoDaMensagem(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((parte) =>
				parte && typeof parte === "object" && typeof (parte as { text?: unknown }).text === "string"
					? (parte as { text: string }).text
					: "",
			)
			.filter(Boolean)
			.join("\n");
	}
	return conteudoSeguro(content);
}

/** Serialização que nunca lança (payload do provedor pode ser qualquer coisa). */
export function conteudoSeguro(valor: unknown): string {
	if (typeof valor === "string") return valor;
	try {
		return JSON.stringify(valor) ?? "";
	} catch {
		return "";
	}
}

/** As três partes do input real ao modelo, do payload. `tools` é a DEFINIÇÃO
 *  completa (o agente decide o que mostrar é outra coisa — P10 é conversa). */
export function entradaCompleta(payload: unknown): EntradaCompleta {
	if (!payload || typeof payload !== "object") return null;
	const mensagens = (payload as { messages?: unknown }).messages;
	if (!Array.isArray(mensagens)) return null;

	let system: string | null = null;
	const outras: unknown[] = [];
	for (const mensagem of mensagens) {
		const papel = mensagem ? (mensagem as { role?: unknown }).role : undefined;
		if (papel === "system" && system === null) {
			system = textoDaMensagem((mensagem as { content?: unknown }).content);
			continue;
		}
		outras.push({
			role: papel ?? null,
			content: (mensagem as { content?: unknown })?.content ?? null,
		});
	}

	return {
		system,
		historico: conteudoSeguro(
			outras.map((m) => {
				const msg = m as { role: unknown; content: unknown };
				return { role: msg.role, content: textoDaMensagem(msg.content) };
			}),
		),
		tools: conteudoSeguro((payload as { tools?: unknown }).tools ?? null),
	};
}

/** Meta de truncamento no MESMO formato do plugin (`TruncationMeta`), para a
 *  leitura no Langfuse ser uniforme entre as observations. */
export function comTeto(
	texto: string,
	teto: number,
): {
	texto: string;
	meta: { truncated: boolean; orig_len: number; kept_len?: number; sha256?: string };
} {
	if (texto.length <= teto) {
		return { texto, meta: { truncated: false, orig_len: texto.length } };
	}
	return {
		texto: texto.slice(0, Math.max(0, teto)),
		meta: {
			truncated: true,
			orig_len: texto.length,
			kept_len: Math.max(0, teto),
			sha256: createHash("sha256").update(texto).digest("hex"),
		},
	};
}

/** O teto vigente: `PI_LANGFUSE_MAX_CHARS` do ambiente; inválido ou ausente
 *  cai no default da casa (40.000), nunca no 20.000 do plugin — que cortaria
 *  justamente o começo do system (medido em 27/10/2026: 20.709 caracteres). */
export function tetoDoInput(env: Ambiente = process.env): number {
	const bruto = Number(env.PI_LANGFUSE_MAX_CHARS);
	return Number.isFinite(bruto) && bruto > 0 ? bruto : Number(MAX_CHARS_PADRAO);
}

type ContextoDoPai = { traceId: string; spanId: string; sessionId?: string };

/** O pai publicado pelo plugin no `before_agent_start` — as mesmas envs que ele
 *  usa para amarrar os traces de subagente. Sem elas, não há a que se anexar. */
function contextoDoPai(env: Ambiente): ContextoDoPai | null {
	const traceId = env[ENV_PARENT_TRACE_ID]?.trim().toLowerCase();
	const spanId = env[ENV_PARENT_SPAN_ID]?.trim().toLowerCase();
	if (!traceId || !spanId || !HEX_TRACE_ID.test(traceId) || !HEX_SPAN_ID.test(spanId)) return null;
	if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
	const sessionId = env[ENV_PARENT_SESSION_ID]?.trim() || undefined;
	return { traceId, spanId, sessionId };
}

/** Anexa o input completo (system da caixa + histórico + definição das tools)
 *  à trace do turno, como uma observation filha da root do plugin.
 *
 *  NO-OP total quando: observabilidade desligada; pai ausente (env sem as
 *  `LANGFUSE_PI_PARENT_*`); payload sem `messages`; ou qualquer erro — inclusive
 *  provider não posto ainda. Nada aqui pode estourar no turno do cliente. */
export function anexarInputCompleto(payload: unknown, env: Ambiente = process.env): void {
	try {
		if (!langfuseLigado(env)) return;
		const pai = contextoDoPai(env);
		if (!pai) return;
		const entrada = entradaCompleta(payload);
		if (!entrada) return;

		const teto = tetoDoInput(env);
		const system = comTeto(entrada.system ?? "", teto);
		const historico = comTeto(entrada.historico, teto);
		const tools = comTeto(entrada.tools, teto);

		startObservation(
			NOME_DA_OBSERVACAO,
			{
				input: {
					system: system.texto || undefined,
					historico: historico.texto || undefined,
					tools: tools.texto || undefined,
				},
				metadata: {
					fonte: "aja-agora",
					system_meta: entrada.system === null ? { ausente: true } : system.meta,
					historico_meta: historico.meta,
					tools_meta: tools.meta,
					...(pai.sessionId ? { session_id: pai.sessionId } : {}),
				},
			},
			{
				asType: "generation",
				parentSpanContext: {
					traceId: pai.traceId,
					spanId: pai.spanId,
					traceFlags: 1, // sampled — o plugin só publica pai amostrado
					isRemote: true,
				},
			},
		).end();
	} catch (erro) {
		console.error("[langfuse] input completo não anexado — turno segue:", erro);
	}
}

/** O hook da camada nossa. Registrado junto com as tools na factory da sessão
 *  (`sessao.ts`), só com a observabilidade ligada — desligada, nenhum handler
 *  existe e o turno é byte por byte o de antes. */
export function registrarEnvelopeDoInputCompleto(api: ExtensionAPI): () => void {
	return api.on("before_provider_request", (event) => {
		anexarInputCompleto(event.payload);
	});
}
