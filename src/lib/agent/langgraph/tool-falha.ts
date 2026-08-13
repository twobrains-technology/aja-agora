// FIX-431 — o que o servidor faz quando o modelo chama uma tool que não está
// no toolset da fase (ou quando a tool estoura).
//
// O `ToolNode` não derruba o turno nesses casos — devolve uma `ToolMessage` com
// `status: "error"` e o texto cru do erro. Isso resolve a robustez do GRAFO e
// cria um problema de PRODUTO: o texto cru entra no contexto do modelo, e o
// modelo, sem nenhuma orientação de conduta, o traduz para o cliente como
// "tive um problema técnico" (produção 2026-08-13, sessões `a68b1945` e
// `04fda013` — uma delas terminou em handoff com a venda perdida).
//
// A regra da casa: fala feia do agente NÃO vira regex. Por isso este módulo não
// olha para a fala em lugar nenhum. Ele age no FATO verificável do servidor —
// existe uma ToolMessage com status de erro — e faz duas coisas:
//
//   1. devolve ao modelo uma instrução de CONDUTA no lugar do erro cru (o
//      modelo continua livre para escolher as palavras; o que muda é que ele
//      passa a saber o que fazer em vez de improvisar um pedido de desculpas);
//   2. expõe a falha como dado estruturado, para virar score no Langfuse
//      (`funil-scores.ts`) e, daí, alerta.
//
// O que NÃO é papel deste módulo: consertar a fase. Se `search_groups` está
// fora do toolset porque a identidade ainda não foi coletada, a correção do
// funil é do `tool-policy.ts`/directive. Aqui é a rede que impede o erro de
// infraestrutura de virar fala de vendedor.

import type { BaseMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages";

/** Marcador do bloco de instrução — o mesmo prefixo que os directives usam,
 *  para o modelo reconhecer que é instrução de sistema e não repetir ao cliente. */
export const TOOL_AUSENTE_MARCADOR = "[instrução do sistema — o cliente NÃO vê este texto]";

export type TipoDeFalhaDeTool =
	/** A tool não está no toolset desta fase (tool-policy retirou). */
	| "ausente"
	/** A tool existe e a execução estourou (Bevi fora do ar, validação, etc). */
	| "erro";

export type FalhaDeTool = {
	tool: string;
	tipo: TipoDeFalhaDeTool;
	/** Mensagem crua, preservada para o `comment` do score (diagnóstico). */
	mensagem: string;
};

/** `Tool "<nome>" not found.` é a frase que o ToolNode monta para tool fora do
 *  toolset (tool_node.js:194). É contrato do pacote, não fala de LLM. */
const TOOL_AUSENTE = /Tool "([^"]+)" not found/;

function ehToolMessage(msg: BaseMessage): msg is ToolMessage {
	return msg.getType() === "tool";
}

/** Lê uma ToolMessage e diz se ela representa falha — e de que tipo. */
export function lerFalhaDeTool(msg: BaseMessage): FalhaDeTool | null {
	if (!ehToolMessage(msg)) return null;
	if (msg.status !== "error") return null;
	const mensagem = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
	const ausente = TOOL_AUSENTE.exec(mensagem);
	return {
		tool: ausente?.[1] ?? msg.name ?? "desconhecida",
		tipo: ausente ? "ausente" : "erro",
		mensagem,
	};
}

/**
 * A instrução que substitui o erro cru.
 *
 * Ela diz o que NÃO fazer (anunciar defeito, prometer que "já resolveu",
 * oferecer atendente) e devolve a condução ao modelo, sem ditar frase. O
 * "não diga que houve problema técnico" aqui não é censura de fala: é a
 * informação que faltava — do ponto de vista do cliente NÃO houve problema
 * nenhum, a ferramenta apenas não é usável neste ponto do funil.
 */
export function orientarSobreToolAusente(
	tool: string,
	ctx: {
		/** A busca já rodou e os cards já estão na tela? Muda a conduta certa. */
		buscaJaFeita?: boolean;
	} = {},
): string {
	const base = `${TOOL_AUSENTE_MARCADOR} A ferramenta "${tool}" não está disponível NESTE ponto da conversa — é uma regra do funil, não um defeito. Do lado do cliente nada falhou. NÃO diga que houve problema técnico, instabilidade, erro ou dificuldade; NÃO prometa "já resolvi"; NÃO ofereça passar para um atendente por causa disto.`;
	// Com a busca feita, mandar "conduzir a coleta" faz o agente repetir pergunta
	// que o cliente já respondeu — foi o funil andando para trás da sessão
	// `04fda013`, onde o pré-cadastro fechou e o servidor voltou a perguntar
	// experiência e prazo. A conduta certa depende do estado, não da tool.
	return ctx.buscaJaFeita === true
		? `${base} As opções JÁ ESTÃO NA TELA do cliente — o sistema as buscou. Apresente e comente o que já apareceu, e siga a conversa a partir do que ele responder.`
		: `${base} Siga a conversa normalmente com o que você já sabe, conduzindo para a próxima informação que você ainda precisa do cliente.`;
}

/** Mesma orientação para tool que EXISTE e estourou: aqui houve falha real, mas
 *  quem trata é o servidor (retry/gate) — o cliente não precisa do relatório. */
export function orientarSobreToolComErro(tool: string): string {
	return `${TOOL_AUSENTE_MARCADOR} A ferramenta "${tool}" não retornou dado neste turno. NÃO invente números nem descreva ofertas que você não recebeu, e NÃO narre o erro para o cliente. Conduza a conversa com o que já está confirmado; o sistema reabre a busca no turno seguinte quando for o caso.`;
}

/**
 * Troca as ToolMessages de erro por orientação e devolve as falhas encontradas.
 *
 * O `tool_call_id` e o `name` são preservados: o par `tool_use`/`tool_result` é
 * contrato da API do modelo — perder o id derruba o turno inteiro, que é
 * exatamente o estrago que esta função existe para evitar.
 */
export function reescreverToolMessagesComFalha(
	mensagens: BaseMessage[],
	ctx: { buscaJaFeita?: boolean } = {},
): {
	mensagens: BaseMessage[];
	falhas: FalhaDeTool[];
} {
	const falhas: FalhaDeTool[] = [];
	const saida = mensagens.map((msg) => {
		const falha = lerFalhaDeTool(msg);
		if (!falha) return msg;
		falhas.push(falha);
		const orientacao =
			falha.tipo === "ausente"
				? orientarSobreToolAusente(falha.tool, ctx)
				: orientarSobreToolComErro(falha.tool);
		const original = msg as ToolMessage;
		return new ToolMessage({
			status: "error",
			content: orientacao,
			name: original.name ?? falha.tool,
			tool_call_id: original.tool_call_id,
		});
	});
	return { mensagens: saida, falhas };
}
