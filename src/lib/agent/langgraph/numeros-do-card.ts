// FIX-436 (D7) — o número do card vem da TOOL, nunca da cabeça do modelo.
//
// Em `db26cd54` (produção, 02/10 11:05) a tool `compare_with_financing`
// devolveu financiamento de R$ 5.678,45/mês (Δ R$ 11,68) e o qwen passou ao
// `present_financing_comparison` R$ 6.071 e Δ R$ 404,23: o card desenhou o
// número inventado. O payload do card é o INPUT da tool de apresentação, e o
// input é texto do modelo — quando ele reescreve os números, a tela mente.
//
// Aqui o servidor busca o RESULTADO da tool de DADO que originou o card
// (`compare_with_financing`, `simulate_quota`, `compute_scenarios`) no
// histórico de mensagens do grafo e sobrescreve os campos numéricos com o fato.
// O argumento do modelo segue fornecendo só a CHAVE (categoria, groupId,
// creditValue, termMonths). Sem resultado de origem, o card NÃO sai — e o
// `converse` registra `[card-sem-fonte]`.

import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages";
import { coerceSimulationPayload } from "@/lib/agent/orchestrator/simulation-payload";
import type { ArtifactType } from "@/lib/chat/types";

/** Qual tool de DADO origina os números de cada card. Card fora deste mapa não
 *  revela número de oferta e segue o caminho de sempre (o modelo digita o
 *  payload, que é texto/contexto). */
export const TOOL_DE_ORIGEM: Partial<Record<ArtifactType, string>> = {
	simulation_result: "simulate_quota",
	financing_comparison: "compare_with_financing",
	scenarios: "compute_scenarios",
};

/** A cota ancorada no estado do funil — FATO do servidor. Serve de origem para
 *  o `simulation_result` quando não há ToolMessage utilizável de `simulate_quota`
 *  (extensão de D7 aprovada pelo gerente; ver "Divergência D7"). */
export interface CotaAncorada {
	groupId?: string;
	administradora?: string;
	creditValue?: number;
	monthlyPayment?: number;
	termMonths?: number;
	avgBidValue?: number;
	availableSlots?: number;
}

/** Os campos numéricos de oferta do card de simulação. Quando a origem é a cota
 *  ancorada, eles são REESCRITOS a partir dela — o número do argumento do modelo
 *  não passa, nem parcialmente. */
const CAMPOS_DE_NUMERO_DA_SIMULACAO: readonly string[] = [
	"creditValue",
	"monthlyPayment",
	"adminFee",
	"reserveFund",
	"insurance",
	"totalCost",
	"termMonths",
	"effectiveRate",
	"lanceScenario",
	"embeddedBid",
	"expectedAdjustment",
	"avgBidValue",
	"availableSlots",
];

function ehToolMessage(msg: BaseMessage): msg is ToolMessage {
	return msg.getType() === "tool";
}

/** O corpo de uma ToolMessage já parseado como objeto, ou `null` (escalar,
 *  texto solto ou JSON inválido não serve como fonte de número). */
function corpoDaToolMessage(msg: ToolMessage): Record<string, unknown> | null {
	const bruto = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
	try {
		const corpo: unknown = JSON.parse(bruto);
		return corpo && typeof corpo === "object" && !Array.isArray(corpo)
			? (corpo as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function objeto(v: unknown): Record<string, unknown> | null {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function numero(v: unknown): number | undefined {
	return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** A fonte de uma tool de dado: o RESULTADO que ela devolveu e os ARGS com que
 *  foi chamada. O resultado nem sempre carrega a identidade da cota
 *  (`compare_with_financing`/`compute_scenarios` não trazem a carta); os args
 *  da chamada trazem. */
export interface FonteDaTool {
	resultado: Record<string, unknown>;
	args: Record<string, unknown> | null;
}

/** Os args com que a tool foi chamada, achados pelo `tool_call_id` do
 *  `ToolMessage` na `AIMessage` correspondente. `null` quando a `AIMessage` não
 *  está no histórico (ex.: teste unitário que só passa o `ToolMessage`). */
function argsDaChamada(
	mensagens: readonly BaseMessage[],
	toolCallId: string | undefined,
): Record<string, unknown> | null {
	if (!toolCallId) return null;
	for (let i = mensagens.length - 1; i >= 0; i--) {
		const msg = mensagens[i];
		if (msg.getType() !== "ai") continue;
		const chamadas = (msg as AIMessage).tool_calls;
		if (!chamadas) continue;
		const chamada = chamadas.find((c) => c.id === toolCallId);
		if (chamada) return objeto(chamada.args);
	}
	return null;
}

/** A fonte MAIS RECENTE da tool de dado no histórico, ou `null` se ela não
 *  respondeu (ou respondeu com erro) — a busca vai do FIM para o começo porque
 *  o card fala da última origem, não da primeira. */
export function fonteMaisRecente(
	mensagens: readonly BaseMessage[],
	tool: string,
): FonteDaTool | null {
	for (let i = mensagens.length - 1; i >= 0; i--) {
		const msg = mensagens[i];
		if (!ehToolMessage(msg)) continue;
		if (msg.name !== tool) continue;
		if (msg.status === "error") continue;
		const resultado = corpoDaToolMessage(msg);
		if (!resultado) return null;
		return { resultado, args: argsDaChamada(mensagens, msg.tool_call_id) };
	}
	return null;
}

/** O resultado MAIS RECENTE da tool de dado (só o corpo), para quem não precisa
 *  dos args da chamada. */
export function resultadoMaisRecente(
	mensagens: readonly BaseMessage[],
	tool: string,
): Record<string, unknown> | null {
	return fonteMaisRecente(mensagens, tool)?.resultado ?? null;
}

/** O retorno do `simulate_quota` é utilizável como fonte? (O mesmo trio de
 *  `simulation-payload.ts`, aplicado aqui para que uma resposta sem número não
 *  deixe o card sair com o valor do modelo.) */
function simulacaoUtilizavel(sim: Record<string, unknown>): boolean {
	return (
		(numero(sim.creditValue) ?? 0) > 0 &&
		(numero(sim.monthlyPayment) ?? 0) > 0 &&
		(numero(sim.termMonths) ?? 0) > 0
	);
}

/** O card de simulação fala da MESMA cota que o estado ancorou? Casa por
 *  `groupId` (preferencial) ou, na falta dele em um dos lados, por
 *  `administradora` (case-insensitive). Sem chave comparável, não casa. */
function mesmaCotaQueOCard(argsDoModelo: Record<string, unknown>, cota: CotaAncorada): boolean {
	const gid =
		typeof argsDoModelo.groupId === "string" && argsDoModelo.groupId ? argsDoModelo.groupId : null;
	const gidCota = typeof cota.groupId === "string" && cota.groupId ? cota.groupId : null;
	if (gid && gidCota) return gid === gidCota;
	const adm =
		typeof argsDoModelo.administradora === "string"
			? argsDoModelo.administradora.toUpperCase()
			: null;
	const admCota =
		typeof cota.administradora === "string" ? cota.administradora.toUpperCase() : null;
	if (adm && admCota) return adm === admCota;
	return false;
}

/** A chave textual de cota (groupId/administradora) de um objeto, ou `null`. */
function chaveCota(v: Record<string, unknown> | null | undefined, campo: string): string | null {
	const bruto = v?.[campo];
	return typeof bruto === "string" && bruto.trim() ? bruto.trim().toUpperCase() : null;
}

/**
 * A fonte da tool é da MESMA cota que o card apresenta?
 *
 * `simulation_result` casa por `groupId` (o retorno do `simulate_quota` carrega
 * o id da cota); `financing_comparison`/`scenarios` casam pela CARTA
 * (`creditValue`), que vem dos args da tool de dado ou da cota ancorada. É o
 * que impede um resultado VELHO de outra cota de desenhar o card desta.
 *
 * Sem prova (nenhum dos lados traz a chave) devolve `true`: a ausência de prova
 * não é prova de troca — a supressão só acontece quando os dois lados declaram
 * chaves DIFERENTES.
 */
function mesmaCotaDaFonte(
	artifactType: ArtifactType,
	argsDoModelo: Record<string, unknown>,
	fonte: FonteDaTool,
	cotaAncorada: CotaAncorada | null | undefined,
): boolean {
	if (artifactType === "simulation_result") {
		const gidCard = chaveCota(argsDoModelo, "groupId");
		const gidFonte = chaveCota(fonte.resultado, "groupId") ?? chaveCota(fonte.args, "groupId");
		if (gidCard && gidFonte) return gidCard === gidFonte;
		const admCard = chaveCota(argsDoModelo, "administradora");
		const admFonte =
			chaveCota(fonte.resultado, "administradora") ?? chaveCota(fonte.args, "administradora");
		if (admCard && admFonte) return admCard === admFonte;
		return true;
	}
	const cartaCard = numero(argsDoModelo.creditValue);
	const cartaFonte = numero(fonte.args?.creditValue) ?? numero(cotaAncorada?.creditValue);
	if (cartaCard != null && cartaFonte != null) return cartaCard === cartaFonte;
	return true;
}

/** Payload do card de simulação a partir da cota ancorada: os campos numéricos
 *  de oferta são reescritos com o fato, e os que a cota não carrega são
 *  REMOVIDOS (o número do modelo não sobrevive). Mantém o texto/identidade. */
function coerceComCotaAncorada(
	argsDoModelo: Record<string, unknown>,
	cota: CotaAncorada,
): Record<string, unknown> {
	const limpo: Record<string, unknown> = { ...argsDoModelo };
	for (const campo of CAMPOS_DE_NUMERO_DA_SIMULACAO) delete limpo[campo];
	return {
		...limpo,
		...(numero(cota.creditValue) != null ? { creditValue: cota.creditValue } : {}),
		...(numero(cota.monthlyPayment) != null ? { monthlyPayment: cota.monthlyPayment } : {}),
		...(numero(cota.termMonths) != null ? { termMonths: cota.termMonths } : {}),
		...(numero(cota.avgBidValue) != null ? { avgBidValue: cota.avgBidValue } : {}),
		...(numero(cota.availableSlots) != null ? { availableSlots: cota.availableSlots } : {}),
		...(typeof cota.administradora === "string" ? { administradora: cota.administradora } : {}),
		...(typeof cota.groupId === "string" ? { groupId: cota.groupId } : {}),
	};
}

/**
 * Payload do card com os números do resultado da tool de origem.
 *
 * Ordem de preferência para o `simulation_result`: (1) ToolMessage utilizável de
 * `simulate_quota`; (2) a cota ancorada no estado, para a MESMA cota do card;
 * (3) nada ⇒ `null`.
 *
 * Devolve `null` quando o card revela número e nenhuma origem utilizável existe:
 * o chamador NÃO desenha o card e loga `[card-sem-fonte]`. Para um `artifactType`
 * fora de `TOOL_DE_ORIGEM`, devolve os próprios argumentos do modelo (não há
 * número de oferta a coagir).
 */
export function payloadComNumerosDaFonte(
	artifactType: ArtifactType,
	argsDoModelo: Record<string, unknown>,
	mensagens: readonly BaseMessage[],
	cotaAncorada?: CotaAncorada | null,
): Record<string, unknown> | null {
	const tool = TOOL_DE_ORIGEM[artifactType];
	if (!tool) return argsDoModelo;

	const fonte = fonteMaisRecente(mensagens, tool);

	if (artifactType === "simulation_result") {
		if (
			fonte &&
			simulacaoUtilizavel(fonte.resultado) &&
			mesmaCotaDaFonte(artifactType, argsDoModelo, fonte, cotaAncorada)
		) {
			return coerceSimulationPayload(argsDoModelo, fonte.resultado);
		}
		if (cotaAncorada && mesmaCotaQueOCard(argsDoModelo, cotaAncorada)) {
			return coerceComCotaAncorada(argsDoModelo, cotaAncorada);
		}
		return null;
	}

	if (!fonte) return null;

	if (artifactType === "financing_comparison") {
		if (!mesmaCotaDaFonte(artifactType, argsDoModelo, fonte, cotaAncorada)) return null;
		const consorcio = objeto(fonte.resultado.consorcio);
		const financing = objeto(fonte.resultado.financing);
		const diff = objeto(fonte.resultado.diff);
		if (!consorcio || !financing || !diff) return null;
		if (
			numero(consorcio.monthlyPayment) == null ||
			numero(financing.monthlyPayment) == null ||
			numero(diff.monthlyDelta) == null
		) {
			return null;
		}
		return {
			...argsDoModelo,
			consorcio,
			financing,
			diff,
			...(typeof fonte.resultado.disclaimer === "string"
				? { disclaimer: fonte.resultado.disclaimer }
				: {}),
		};
	}

	// scenarios: o retorno do `compute_scenarios` É o bloco `scenarios` do card.
	if (!mesmaCotaDaFonte(artifactType, argsDoModelo, fonte, cotaAncorada)) return null;
	const cenarios = fonte.resultado;
	const temOsTres = ["conservador", "provavel", "acelerado"].every(
		(nome) => objeto(cenarios[nome]) != null,
	);
	if (!temOsTres) return null;
	return {
		...argsDoModelo,
		scenarios: {
			conservador: cenarios.conservador,
			provavel: cenarios.provavel,
			acelerado: cenarios.acelerado,
		},
	};
}

/** O que o modelo recebe quando o card foi DESCARTADO por falta de fonte. É
 *  fato do servidor, não fala: o card NÃO foi exibido — o modelo não pode narrar
 *  que ele está na tela. */
export function mensagemDeCardSemFonte(toolDeOrigem: string): string {
	return `O card não foi exibido: falta o resultado de ${toolDeOrigem} para esta cota. Chame a ferramenta de dado antes de apresentar; NÃO diga ao cliente que o card está na tela.`;
}

/**
 * Troca o tool-result de SUCESSO dos cards descartados por uma RECUSA honesta.
 *
 * Sem isto, o modelo ouve "sucesso" da tool de apresentação (o `ToolNode` a
 * executa e devolve ok) e narra "confere no card abaixo" — card que não existe.
 * A recusa usa a forma `{ error }` que as tools desta casa já devolvem (e que
 * `toolAceitouPedido` reconhece), preservando `name`/`tool_call_id` do par
 * tool_use/tool_result.
 */
export function toolResultsComRecusaDeCard(
	mensagens: readonly BaseMessage[],
	cardsSemFonte: ReadonlyMap<string, string>,
): BaseMessage[] {
	if (cardsSemFonte.size === 0) return [...mensagens];
	return mensagens.map((msg) => {
		if (msg.getType() !== "tool") return msg;
		const original = msg as ToolMessage;
		const toolDeOrigem = original.tool_call_id
			? cardsSemFonte.get(original.tool_call_id)
			: undefined;
		if (!toolDeOrigem) return msg;
		return new ToolMessage({
			content: JSON.stringify({ error: mensagemDeCardSemFonte(toolDeOrigem) }),
			name: original.name,
			tool_call_id: original.tool_call_id,
		});
	});
}
