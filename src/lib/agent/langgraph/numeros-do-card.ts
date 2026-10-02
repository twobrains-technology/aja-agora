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

import type { BaseMessage, ToolMessage } from "@langchain/core/messages";
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

/** O resultado MAIS RECENTE da tool de dado no histórico, ou `null` se ela não
 *  respondeu (ou respondeu com erro) — a busca vai do FIM para o começo porque
 *  o card fala da última origem, não da primeira. */
export function resultadoMaisRecente(
	mensagens: readonly BaseMessage[],
	tool: string,
): Record<string, unknown> | null {
	for (let i = mensagens.length - 1; i >= 0; i--) {
		const msg = mensagens[i];
		if (!ehToolMessage(msg)) continue;
		if (msg.name !== tool) continue;
		if (msg.status === "error") continue;
		return corpoDaToolMessage(msg);
	}
	return null;
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

	const resultado = resultadoMaisRecente(mensagens, tool);

	if (artifactType === "simulation_result") {
		if (resultado && simulacaoUtilizavel(resultado)) {
			return coerceSimulationPayload(argsDoModelo, resultado);
		}
		if (cotaAncorada && mesmaCotaQueOCard(argsDoModelo, cotaAncorada)) {
			return coerceComCotaAncorada(argsDoModelo, cotaAncorada);
		}
		return null;
	}

	if (!resultado) return null;

	if (artifactType === "financing_comparison") {
		const consorcio = objeto(resultado.consorcio);
		const financing = objeto(resultado.financing);
		const diff = objeto(resultado.diff);
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
			...(typeof resultado.disclaimer === "string" ? { disclaimer: resultado.disclaimer } : {}),
		};
	}

	// scenarios: o retorno do `compute_scenarios` É o bloco `scenarios` do card.
	const cenarios = resultado;
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
