import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import { analyzeTurn, type TurnAnalysis } from "@/lib/agent/turn-analyzer";
import { type ChatMessage, executeAgentTurn } from "./agent-runner";
import { sendInteractiveMessage } from "./api";
import { handoffConfirmationToWhatsApp } from "./formatter";
import { metaOf, persistMeta } from "./meta-helpers";
import { getOrCreateConversation, loadConversationHistory, saveMessage } from "./session";
import { transitionToSpecialist } from "./transition";

// ---- Domain rules (small, used only here) ----

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

// Last-resort category detection when the Haiku analyzer fails (timeout, network).
// Conservative — só pega menções explícitas e claras pra evitar falso-positivo.
const CATEGORY_KEYWORDS: Record<Category, RegExp> = {
	imovel:
		/\b(im[oó]vel|im[oó]veis|apartamento|apto|casa|terreno|kitnet|comercial|sala\s+comercial)\b/i,
	auto: /\b(carro|autom[oó]vel|moto|motocicleta|caminhonete|caminh[aã]o|ve[ií]culo)\b/i,
	servicos: /\b(reforma|viagem|formatura|cirurgia|tratamento|servi[cç]o)\b/i,
};

function fallbackDetectCategory(text: string): Category | null {
	for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as Array<[Category, RegExp]>) {
		if (re.test(text)) return cat;
	}
	return null;
}

// ---- Analyzer + merge into meta (mutates meta) ----

type AnalyzeResult = {
	analysis: TurnAnalysis;
	metaChanged: boolean;
	newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null;
};

async function analyzeAndMerge(
	text: string,
	currentPersona: Persona,
	meta: ConversationMetadata,
): Promise<AnalyzeResult> {
	const analysis = await analyzeTurn(text, currentPersona, meta);

	let metaChanged = false;
	// Tracked separately from meta because we trigger the consórcio overview
	// nudge only when extraction *just happened* this turn (vs. a previous one).
	let newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null = null;

	// Each field only fills empty slots — never overwrites a previous answer.
	let extractedQualifyField = false;
	if (analysis.experiencePrev && !meta.experiencePrev) {
		meta.experiencePrev = analysis.experiencePrev;
		newlyExtractedExperience = analysis.experiencePrev;
		metaChanged = true;
	}
	const q = meta.qualifyAnswers ?? {};
	if (analysis.creditMax !== null && q.creditMax === undefined) {
		q.creditMin = analysis.creditMin ?? Math.round(analysis.creditMax * 0.9);
		q.creditMax = analysis.creditMax;
		meta.qualifyAnswers = q;
		metaChanged = true;
		extractedQualifyField = true;
	}
	if (analysis.prazoMeses !== null && q.prazoMeses === undefined) {
		q.prazoMeses = analysis.prazoMeses;
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
	// Typing a qualify value implies consent — same effect as clicking "Bora!".
	if (extractedQualifyField && !meta.qualifyConsented) {
		meta.qualifyConsented = true;
		metaChanged = true;
	}
	// Volunteering concrete data also implies familiarity. Skip the "Você já fez consórcio?"
	// gate — feels robotic when user clearly knows what they want.
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

// ---- Routing decision (pure) ----

type RoutingDecision =
	| { kind: "stay" }
	| { kind: "transition"; toCategory: Category; usedFallback: boolean };

function decideRouting(
	text: string,
	meta: ConversationMetadata,
	analysis: TurnAnalysis,
): RoutingDecision {
	const detectedCategory = analysis.detectedCategory ?? fallbackDetectCategory(text);
	if (!detectedCategory) return { kind: "stay" };
	if (detectedCategory === meta.currentCategory) return { kind: "stay" };
	if (!meta.currentCategory || analysis.isExplicitSwitch) {
		return {
			kind: "transition",
			toCategory: detectedCategory,
			usedFallback: !analysis.detectedCategory,
		};
	}
	return { kind: "stay" };
}

// ---- System context for the agent turn ----

function buildSystemContext(args: {
	knownName: string | null;
	newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null;
	meta: ConversationMetadata;
}): ChatMessage[] {
	const { knownName, newlyExtractedExperience, meta } = args;
	const out: ChatMessage[] = [];

	if (knownName) {
		out.push({ role: "system", content: `Nome do usuario: "${knownName}"` });
	}

	if (newlyExtractedExperience === "first") {
		out.push({
			role: "system",
			content: `O usuario acabou de revelar nesta mensagem que e a PRIMEIRA VEZ dele com consorcio. FLUXO IMPORTANTE: na sua resposta agora, reaja brevemente E EM SEGUIDA dê uma explicação curta (3-4 frases) sobre o essencial: grupo de pessoas que paga parcelas mensais sem juros, contemplacao por sorteio ou lance, diferenca de financiamento. Tom acolhedor, sem jargao tecnico (nada de cota/lance livre/fundo reserva). Termine sem pergunta — o sistema dispara a proxima etapa.`,
		});
	} else if (newlyExtractedExperience === "returning") {
		out.push({
			role: "system",
			content: `O usuario acabou de revelar que ja tem familiaridade com consorcio. FLUXO: reaja em UMA frase curta tipo "Show, vamos direto ao ponto entao." NAO explique o produto, NAO faca pergunta. O sistema dispara a proxima etapa em seguida.`,
		});
	}

	// AI shouldn't close with "tem mais alguma duvida?" — system fires consent buttons
	// right after; the duplicate question creates friction.
	if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed) {
		out.push({
			role: "system",
			content: `O usuario clicou "Tenho duvidas" anteriormente e agora esta perguntando algo especifico. Responda a duvida dele de forma direta e CLARA, em 2-4 frases. NAO termine com "tem mais alguma duvida?", "ficou claro?", "alguma outra pergunta?" ou similar — o sistema dispara automaticamente a transicao com botoes pra ele decidir se quer seguir ou pedir mais info. Voce so precisa entregar a resposta e parar.`,
		});
	}

	return out;
}

// ---- Main entry: process a user text via AI ----

export async function processWithAI(
	from: string,
	text: string,
	contactName?: string,
): Promise<void> {
	const { id: conversationId } = await getOrCreateConversation(from);

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const currentPersona: Persona = meta.currentPersona ?? "concierge";

	if (contactName && contactName !== conv?.contactName) {
		await db
			.update(conversations)
			.set({ contactName, updatedAt: new Date() })
			.where(eq(conversations.id, conversationId));
	}

	// While handoff is pending confirmation, don't run the agent or advance gates.
	// Re-prompt with the deterministic confirmation buttons so the user sees them again.
	if (meta.handoffSuggested) {
		await saveMessage(conversationId, "user", text);
		const r = handoffConfirmationToWhatsApp();
		if (r.interactive) await sendInteractiveMessage(from, r.interactive);
		return;
	}

	const knownName = contactName ?? conv?.contactName ?? null;

	const { analysis, metaChanged, newlyExtractedExperience } = await analyzeAndMerge(
		text,
		currentPersona,
		meta,
	);

	if (metaChanged) {
		await persistMeta(conversationId, meta);
	}

	const decision = decideRouting(text, meta, analysis);
	if (decision.kind === "transition") {
		if (decision.usedFallback) {
			console.log(
				`[whatsapp-processor] Analyzer missed category — regex fallback detected "${decision.toCategory}" in: "${text.slice(0, 80)}"`,
			);
		}
		await saveMessage(conversationId, "user", text);
		await transitionToSpecialist({
			from,
			conversationId,
			fromPersona: currentPersona,
			toCategory: decision.toCategory,
			expertiseHint: analysis.detectedSubTopic,
		});
		return;
	}

	await saveMessage(conversationId, "user", text);
	const history = await loadConversationHistory(conversationId);

	const contextMessages = buildSystemContext({ knownName, newlyExtractedExperience, meta });

	await executeAgentTurn({
		from,
		conversationId,
		currentPersona,
		meta,
		messages: [...contextMessages, ...history],
		isUserTurn: true,
		userIntent: analysis.userIntent,
	});
}
