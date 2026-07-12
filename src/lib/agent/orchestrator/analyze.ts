import { parseAssetValue } from "@/lib/agent/parse-asset-value";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
import { clampCreditToCategory, objetivoForPrazo } from "@/lib/agent/qualify-config";
import { nextGate } from "@/lib/agent/qualify-state";
import { analyzeTurn, type TurnAnalysis } from "@/lib/agent/turn-analyzer";

// FIX-74 (QA dono-de-produto 2026-07-02): a jornada AUTO web em prod pulou o
// gate "timeframe" — o usuário disse só "…R$ 70 mil, gastando perto de R$ 900
// por mês" (valor + orçamento MENSAL, sem menção de prazo) e o analyzer LLM
// classificou "R$ 900/mês" como prazoMeses não-nulo. O gate e a guarda contra
// null já existiam (qualify-state.ts / analyze.ts); o defeito é confiabilidade
// do classificador, que o prompt sozinho não elimina 100%. Guard
// DETERMINÍSTICO: quando a mensagem só traz cadência mensal ("por mês",
// "/mês", "mensal") e NENHUMA menção explícita de duração (dígito + "anos"/
// "meses", ex.: "24 meses", "2 anos"), o prazoMeses extraído é descartado —
// não confia só no prompt do analyzer.
const MONTHLY_CADENCE_MARKER = /(por|ao|a\s+cada)\s*m[êe]s|\/\s*m[êe]s|\bmensal(mente)?\b/i;
const EXPLICIT_DURATION_MENTION = /\b\d+\s*(anos?|meses?)\b/i;

/** Rejeita prazoMeses extraído quando a mensagem só sinaliza orçamento/parcela
 * MENSAL, sem nenhuma menção explícita de duração (dígito + anos/meses). */
function isMonthlyBudgetOnlyMention(text: string): boolean {
	return MONTHLY_CADENCE_MARKER.test(text) && !EXPLICIT_DURATION_MENTION.test(text);
}

export type AnalyzeResult = {
	analysis: TurnAnalysis;
	metaChanged: boolean;
	newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null;
};

export async function analyzeAndMerge(
	text: string,
	currentPersona: Persona,
	meta: ConversationMetadata,
): Promise<AnalyzeResult> {
	const analysis = await analyzeTurn(text, currentPersona, meta);
	// FIX-236: snapshot do gate REALMENTE ativo pro usuário NESTE turno, antes
	// de qualquer merge desta função alterar o estado (ver guard de hasLance
	// abaixo — merges anteriores no mesmo turno não podem "destravar" o gate
	// lance por baixo do pano).
	const activeGateAtTurnStart = nextGate(meta, { hasContactName: true });

	let metaChanged = false;
	let newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null = null;

	if (analysis.experiencePrev && !meta.experiencePrev) {
		meta.experiencePrev = analysis.experiencePrev;
		newlyExtractedExperience = analysis.experiencePrev;
		metaChanged = true;
	}
	// FIX-285: marca que o gate `desire` recebeu uma RESPOSTA — independente do
	// que o analyzer extraiu como `desiredItem` (que fica null por design na
	// categoria genérica). Escopado à janela `identify` (ativo entre o desire
	// já perguntado e a identidade ainda não coletada — exatamente o turno da
	// resposta ao desire, FIX-53): sem esse escopo, qualquer turno POSTERIOR
	// (ex.: respondendo o `credit`, muitos turnos depois) marcaria o campo
	// retroativamente e `shouldAskMotive` passaria a segurar TODOS os gates
	// dali em diante, não só o `identify` (regressão pega pelos cassettes de
	// `agent-trajectory.test.ts`, FIX-208).
	if (meta.desireAsked && !meta.desireAnswered && activeGateAtTurnStart === "identify") {
		meta.desireAnswered = true;
		metaChanged = true;
	}
	const q = meta.qualifyAnswers ?? {};
	// FIX-68: pós-reveal o usuário pode TROCAR de faixa de valor — um creditMax
	// novo, fornecido explicitamente (providing_info) e DIFERENTE do que já está
	// no perfil, é re-descoberta legítima, então atualiza (e a tool-policy
	// reabilita `search_groups` via revealValueTargetChanged). Sem isso o valor
	// ficava preso no original e o agent fabricava um id pra simular a faixa nova
	// (conversa a8b0a80d, 2026-06-22). Compara contra o valor ORIGINAL pedido
	// (creditClampedFrom, quando clampado) pra não re-disparar por causa do clamp.
	const lastRequested = q.creditClampedFrom ?? q.creditMax;
	const isRevealRefit =
		meta.revealCompleted === true &&
		analysis.userIntent === "providing_info" &&
		analysis.creditMax !== null &&
		analysis.creditMax !== lastRequested;
	// FIX-115 (PROD 2026-06-30): backstop DETERMINÍSTICO do valor do bem. O valor é
	// coletado por conversa (FIX-104) e depende do analyzer LLM extrair o creditMax
	// — que cai em NEUTRAL_FALLBACK (creditMax=null) em timeout de cold-start. Sem
	// backstop, "50k" digitado não vira número, o gate `credit` re-dispara e o funil
	// TRAVA (requisito do Kairo: "se o componente nao aparecer tem que se resolver
	// mesmo assim"). Só na coleta INICIAL (creditMax ainda ausente); o refit
	// pós-reveal segue guiado pelo analyzer — trocar de faixa é decisão do LLM.
	//
	// FIX-208 (PROD 2026-07-02): quando o gate de VALOR está pendente (toda a
	// pré-qualificação feita, só falta o creditMax), o backstop recebe o contexto do
	// gate `credit` — aí um número NU ("200") vira valor (200 mil, clampado). Sem
	// isso, parseAssetValue("200")=null por design e o funil fechava mudo no gate de
	// valor. O contexto só é passado quando o gate credit está DE FATO pendente.
	// FIX-274: o gate `consent` saiu do funil — o pré-requisito do `credit` agora é
	// só identidade coletada (identify vem antes do credit desde o FIX-53).
	const creditGatePending =
		q.creditMax === undefined &&
		Boolean(meta.currentCategory) &&
		Boolean(meta.identityCollected) &&
		!meta.pendingFollowUp;
	const parsedCreditMax =
		analysis.creditMax === null && q.creditMax === undefined
			? parseAssetValue(
					text,
					creditGatePending ? { gate: "credit", category: meta.currentCategory } : undefined,
				)
			: null;
	const sourceCreditMax = analysis.creditMax ?? parsedCreditMax;
	// FIX-279 (loop r9, baseline Sonnet 3/10, G3): mesmo guard do FIX-236 (linha
	// 140, hasLance) aplicado a creditMax — captura oportunista irrestrita
	// preenchia q.creditMax de QUALQUER turno de texto livre (ex.: o turno de
	// `desire`, "Um apartamento de uns 250 mil"), ANTES de o gate `credit` (a
	// agulha dedicada, P4 do canônico) ficar ativo. Como nextGate() só dispara
	// o gate enquanto `creditMax === undefined`, o valor pré-preenchido fazia a
	// agulha nunca aparecer. `isRevealRefit` continua como exceção legítima
	// separada (troca de faixa pós-reveal é decisão do LLM, independe do gate
	// ativo no momento).
	if (
		sourceCreditMax !== null &&
		((q.creditMax === undefined && activeGateAtTurnStart === "credit") || isRevealRefit)
	) {
		// FIX-33 (revogado por FIX-218, Ata 2026-07-04): o valor de texto livre NÃO
		// é mais capado na faixa da categoria — `clampCreditToCategory` agora só
		// normaliza (nunca ajusta `value`). Sem categoria ainda (concierge), grava
		// o valor cru — não há faixa de referência.
		const clamp = meta.currentCategory
			? clampCreditToCategory(sourceCreditMax, meta.currentCategory)
			: null;
		const creditMax = clamp ? clamp.value : sourceCreditMax;
		const rawMin = analysis.creditMin ?? Math.round(creditMax * 0.9);
		// creditMin derivado nunca fica abaixo do piso da faixa nem acima do
		// creditMax real (que já não é mais capado ao teto da categoria).
		q.creditMin = clamp ? Math.min(Math.max(rawMin, clamp.min), creditMax) : rawMin;
		q.creditMax = creditMax;
		if (clamp?.clamped) {
			// Preserva o valor original pedido pro agente confrontar a faixa.
			q.creditClampedFrom = sourceCreditMax;
		} else {
			// FIX-68: num refit (troca de faixa) sem clamp, o creditClampedFrom do
			// pedido anterior ficaria stale e poderia mascarar a próxima troca.
			q.creditClampedFrom = undefined;
		}
		meta.qualifyAnswers = q;
		metaChanged = true;
	}
	// FIX-284: captura oportunista do valor mencionado ANTES de o gate `credit`
	// ficar ativo (ex.: no turno do `desire`, "Um carro, uns 70 mil") — SEM
	// gating por `activeGateAtTurnStart` (nunca substitui a agulha formal do
	// FIX-279 acima, só serve pra o gate `credit` poder CONFIRMAR esse valor
	// em vez de perguntar do zero, ver gate-questions.ts). Primeira ocorrência
	// apenas, mesmo padrão de `desiredItem`/`motivation`.
	if (sourceCreditMax !== null && q.creditMentionedAtDesire === undefined) {
		q.creditMentionedAtDesire = sourceCreditMax;
		meta.qualifyAnswers = q;
		metaChanged = true;
	}
	if (
		analysis.prazoMeses !== null &&
		q.prazoMeses === undefined &&
		!isMonthlyBudgetOnlyMention(text)
	) {
		q.prazoMeses = analysis.prazoMeses;
		q.objetivo = objetivoForPrazo(analysis.prazoMeses);
		meta.qualifyAnswers = q;
		metaChanged = true;
	}
	// FIX-236 (Fable r1, D3.1): hasLance só é aceito quando o gate `lance` é o
	// REALMENTE ativo (calculado ANTES deste merge, com o estado da rodada).
	// Captura oportunista irrestrita (como creditMax/prazoMeses) vazava sinais
	// falsos — "Queria rápido, mas não tenho grana agora" respondendo o gate
	// `timeframe` continha "não tenho" e o analyzer extraía hasLance="no" cedo
	// demais, fazendo nextGate PULAR o gate `lance` direto pra lance-embutido.
	// Pior: com hasLance já "no", a recusa explícita depois ("não quero
	// comprometer nada além da parcela" → so_parcela) nunca sobrescrevia (guard
	// `!q.hasLance`), repetindo a MESMA educação de embutido em loop. A conversa
	// de lance só existe PÓS-reveal (FIX-215) — restringir ao gate ativo não
	// perde nenhum caminho legítimo.
	if (analysis.hasLance && !q.hasLance && activeGateAtTurnStart === "lance") {
		q.hasLance = analysis.hasLance;
		meta.qualifyAnswers = q;
		metaChanged = true;
	}
	// FIX-233 (gate `desire`, não bloqueante): captura oportunista de
	// desiredItem/motivation por texto livre — o gate não bloqueia o funil se
	// eles nunca chegarem, mas quando o usuário os menciona (aqui ou em
	// qualquer turno posterior), salva a primeira ocorrência.
	if (analysis.desiredItem && !q.desiredItem) {
		q.desiredItem = analysis.desiredItem;
		meta.qualifyAnswers = q;
		metaChanged = true;
	}
	if (analysis.motivation && !q.motivation) {
		q.motivation = analysis.motivation;
		meta.qualifyAnswers = q;
		metaChanged = true;
	}
	// FIX-241 (rodada 2, Fable r1, D1 — âncora de dinheiro): captura oportunista
	// de monthlySavings/fgtsValue por texto livre, mesmo padrão do FIX-233
	// acima — primeira ocorrência só, nunca sobrescrita por turno posterior.
	// Alimenta anchorMonth() (dial-payload.ts) em vez do prazo desejado.
	if (analysis.monthlySavings !== null && q.monthlySavings === undefined) {
		q.monthlySavings = analysis.monthlySavings;
		meta.qualifyAnswers = q;
		metaChanged = true;
	}
	if (analysis.fgtsValue !== null && q.fgtsValue === undefined) {
		q.fgtsValue = analysis.fgtsValue;
		meta.qualifyAnswers = q;
		metaChanged = true;
	}
	// FIX-274 (Kairo, 2026-07-11): o gate `consent` saiu do funil, então o
	// auto-consentimento por texto livre ("sim"/"bora" destrava o consent — antigo
	// BUG-FUNIL-PULA-PASSO2 / FIX-273) foi REMOVIDO junto: não há mais consent pra
	// destravar. `qualifyConsented` deixou de ser lido por qualquer caminho vivo.

	if (analysis.expertiseLevel !== "neutro" && analysis.expertiseLevel !== meta.expertiseLevel) {
		meta.expertiseLevel = analysis.expertiseLevel;
		metaChanged = true;
	}

	return { analysis, metaChanged, newlyExtractedExperience };
}
