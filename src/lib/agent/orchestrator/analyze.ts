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

	let extractedQualifyField = false;
	if (analysis.experiencePrev && !meta.experiencePrev) {
		meta.experiencePrev = analysis.experiencePrev;
		newlyExtractedExperience = analysis.experiencePrev;
		metaChanged = true;
	}
	const q = meta.qualifyAnswers ?? {};
	if (analysis.creditMax !== null && q.creditMax === undefined) {
		// FIX-33: o valor de texto livre não passa pelos sliders — clampa na faixa
		// da categoria (quando conhecida) antes de gravar. Sem categoria ainda
		// (concierge), grava o valor cru — não há faixa de referência.
		const clamp = meta.currentCategory
			? clampCreditToCategory(analysis.creditMax, meta.currentCategory)
			: null;
		const creditMax = clamp ? clamp.value : analysis.creditMax;
		const rawMin = analysis.creditMin ?? Math.round(creditMax * 0.9);
		// creditMin derivado herda o clamp — nunca acima do teto da faixa.
		q.creditMin = clamp ? Math.min(Math.max(rawMin, clamp.min), clamp.max) : rawMin;
		q.creditMax = creditMax;
		if (clamp?.clamped) {
			// Preserva o valor original pedido pro agente confrontar a faixa.
			q.creditClampedFrom = analysis.creditMax;
		}
		meta.qualifyAnswers = q;
		metaChanged = true;
		extractedQualifyField = true;
	}
	if (analysis.prazoMeses !== null && q.prazoMeses === undefined) {
		q.prazoMeses = analysis.prazoMeses;
		q.objetivo = objetivoForPrazo(analysis.prazoMeses);
		meta.qualifyAnswers = q;
		metaChanged = true;
		extractedQualifyField = true;
	}
	if (analysis.hasLance && !q.hasLance) {
		q.hasLance = analysis.hasLance;
		meta.qualifyAnswers = q;
		metaChanged = true;
		extractedQualifyField = true;
	}
	if (extractedQualifyField && !meta.qualifyConsented) {
		meta.qualifyConsented = true;
		metaChanged = true;
	}
	if (extractedQualifyField && !meta.experiencePrev) {
		meta.experiencePrev = "returning";
		metaChanged = true;
	}

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
