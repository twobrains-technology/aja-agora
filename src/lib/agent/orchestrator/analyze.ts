import { parseAssetValue } from "@/lib/agent/parse-asset-value";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
import { clampCreditToCategory, objetivoForPrazo } from "@/lib/agent/qualify-config";
import { analyzeTurn, type TurnAnalysis } from "@/lib/agent/turn-analyzer";

const AFFIRMATIVE_REPLIES = new Set([
	"sim",
	"claro",
	"ok",
	"okay",
	"vamos",
	"vamo",
	"bora",
	"manda",
	"manda ver",
	"pode",
	"pode mandar",
	"pode ser",
	"certo",
	"beleza",
	"blz",
	"show",
	"isso",
	"aham",
	"positivo",
	"topo",
	"topei",
	"tá",
	"ta",
	"fechou",
	"vai",
	"segue",
	"siga",
]);

function isShortAffirmative(text: string): boolean {
	const trimmed = text
		.trim()
		.toLowerCase()
		.replace(/[!.?,]+$/, "")
		.trim();
	return AFFIRMATIVE_REPLIES.has(trimmed);
}

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

	let metaChanged = false;
	let newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null = null;

	if (analysis.experiencePrev && !meta.experiencePrev) {
		meta.experiencePrev = analysis.experiencePrev;
		newlyExtractedExperience = analysis.experiencePrev;
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
	const parsedCreditMax =
		analysis.creditMax === null && q.creditMax === undefined ? parseAssetValue(text) : null;
	const sourceCreditMax = analysis.creditMax ?? parsedCreditMax;
	if (sourceCreditMax !== null && (q.creditMax === undefined || isRevealRefit)) {
		// FIX-33: o valor de texto livre não passa pelos sliders — clampa na faixa
		// da categoria (quando conhecida) antes de gravar. Sem categoria ainda
		// (concierge), grava o valor cru — não há faixa de referência.
		const clamp = meta.currentCategory
			? clampCreditToCategory(sourceCreditMax, meta.currentCategory)
			: null;
		const creditMax = clamp ? clamp.value : sourceCreditMax;
		const rawMin = analysis.creditMin ?? Math.round(creditMax * 0.9);
		// creditMin derivado herda o clamp — nunca acima do teto da faixa.
		q.creditMin = clamp ? Math.min(Math.max(rawMin, clamp.min), clamp.max) : rawMin;
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
	if (analysis.hasLance && !q.hasLance) {
		q.hasLance = analysis.hasLance;
		meta.qualifyAnswers = q;
		metaChanged = true;
	}
	// BUG-FUNIL-PULA-PASSO2 (QA noturno 2026-06-21): NÃO presumir experiência nem
	// consentimento só porque o usuário voluntariou um dado de qualificação (valor/
	// prazo/lance) em texto livre. Antes, qualquer extração cravava
	// experiencePrev="returning" + qualifyConsented=true, e o nextGate pulava os
	// gates `experience` e `consent` (passo 2 da jornada-canonica §2) — justamente
	// no caminho mais comum, já que a landing incentiva dizer o valor de cara. Os
	// dados extraídos acima PERMANECEM salvos (não se re-pergunta o valor); o passo
	// 2 volta a ser dirigido pelos botões reais: o gate `experience` persiste
	// experiencePrev e o gate `consent` persiste qualifyConsented (route.ts:776-803).
	// A confirmação curta ("sim"/"bora") ainda destrava o consent logo abaixo.
	if (
		meta.currentCategory &&
		!meta.qualifyConsented &&
		meta.experiencePrev &&
		!meta.pendingFollowUp &&
		isShortAffirmative(text)
	) {
		meta.qualifyConsented = true;
		metaChanged = true;
	}

	if (analysis.expertiseLevel !== "neutro" && analysis.expertiseLevel !== meta.expertiseLevel) {
		meta.expertiseLevel = analysis.expertiseLevel;
		metaChanged = true;
	}

	return { analysis, metaChanged, newlyExtractedExperience };
}
