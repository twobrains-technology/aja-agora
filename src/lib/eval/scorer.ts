import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationEvaluations, conversations } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { getPersonaForAdmin } from "@/lib/agent/personas-repo";
import { isEligibleForEval } from "./eligibility";
import { JUDGE_MODEL, judgeConversation } from "./judge";
import { type PersonaContext, RUBRIC_VERSION } from "./rubric";
import { pickPrimaryLead } from "./scorer-internals";
import { computeEvalFromData, type JudgeFn } from "./scorer-pipeline";

// Test seam: scorer tests inject a mocked judge to avoid network calls.
let judgeImpl: JudgeFn = judgeConversation;

export function __setJudgeImplForTests(fn: JudgeFn): void {
	judgeImpl = fn;
}

export function __resetJudgeImplForTests(): void {
	judgeImpl = judgeConversation;
}

export type ScoreOutcome =
	| { skipped: true; reason: string }
	| { skipped: false; success: true; evaluationId: string; overallScore: number }
	| { skipped: false; success: false; evaluationId: string };

export type ScoreOptions = {
	/** Pula a regra de inatividade (triggers síncronos como closeHandoff e capture_lead). */
	forceImmediate?: boolean;
};

export async function scoreConversation(
	conversationId: string,
	options: ScoreOptions = {},
): Promise<ScoreOutcome> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		with: {
			messages: {
				orderBy: (m, { asc }) => [asc(m.createdAt)],
				with: { artifacts: true },
			},
			leads: true,
		},
	});

	if (!conv) {
		return { skipped: true, reason: "conversation not found" };
	}

	const userTurns = conv.messages.filter((m) => m.role === "user").length;
	const eligibility = isEligibleForEval(
		{
			status: conv.status,
			updatedAt: conv.updatedAt,
			userTurnCount: userTurns,
		},
		new Date(),
		{ forceImmediate: options.forceImmediate },
	);
	if (!eligibility.eligible) {
		return { skipped: true, reason: eligibility.reason };
	}

	const metadata = (conv.metadata ?? null) as ConversationMetadata | null;
	const lead = pickPrimaryLead(conv.leads);

	const messages = conv.messages.map((m) => ({
		id: m.id,
		role: m.role,
		content: m.content,
		createdAt: m.createdAt,
		personaId: m.personaId,
	}));
	const artifacts = conv.messages.flatMap((m) =>
		m.artifacts.map((a) => ({
			messageId: a.messageId,
			type: a.type,
			payload: a.payload as Record<string, unknown>,
		})),
	);
	const evaluatedUntilMessageId = conv.messages.at(-1)?.id ?? null;

	// Personas vistas: união do que foi atribuído nas mensagens com a current persona
	// do metadata. Quando todas as mensagens estão sem personaId (conversa legacy),
	// cai no comportamento de persona única via currentPersona.
	const personaIds = new Set<string>();
	for (const m of messages) {
		if (m.role === "assistant" && m.personaId) personaIds.add(m.personaId);
	}
	if (personaIds.size === 0 && metadata?.currentPersona) personaIds.add(metadata.currentPersona);

	const loaded = await Promise.all(Array.from(personaIds).map((id) => loadPersonaContext(id)));
	const personas = loaded.map((p) => p.context);
	// Persona "principal" pra eval row: a current se houver, senão a primeira.
	const primary =
		loaded.find((p) => p.context.personaId === metadata?.currentPersona) ?? loaded[0] ?? null;

	const computed = await computeEvalFromData(
		{
			status: conv.status,
			channel: conv.channel,
			currentPersona: metadata?.currentPersona ?? null,
			currentCategory: metadata?.currentCategory ?? null,
			messages,
			artifacts,
			lead,
			personas,
			metadata,
		},
		judgeImpl,
	);

	if (computed.kind === "failure") {
		console.error(
			`[eval-scorer] judge failed for conversation=${conversationId}: ${computed.error}`,
		);
		const [saved] = await db
			.insert(conversationEvaluations)
			.values({
				conversationId,
				personaId: primary?.context.personaId ?? null,
				personaVersion: primary?.version ?? null,
				rubricVersion: RUBRIC_VERSION,
				judgeModel: JUDGE_MODEL,
				overallScore: null,
				dimensions: null,
				flags: null,
				topIssues: null,
				topStrengths: null,
				tokensInput: null,
				tokensOutput: null,
				evaluatedUntilMessageId,
				error: computed.error,
			})
			.returning({ id: conversationEvaluations.id });
		return { skipped: false, success: false, evaluationId: saved.id };
	}

	const [saved] = await db
		.insert(conversationEvaluations)
		.values({
			conversationId,
			personaId: primary?.context.personaId ?? null,
			personaVersion: primary?.version ?? null,
			rubricVersion: RUBRIC_VERSION,
			judgeModel: JUDGE_MODEL,
			overallScore: computed.overallScore.toFixed(2),
			dimensions: computed.dimensions,
			flags: computed.flags,
			topIssues: computed.topIssues,
			topStrengths: computed.topStrengths,
			tokensInput: computed.tokensInput,
			tokensOutput: computed.tokensOutput,
			evaluatedUntilMessageId,
			error: null,
		})
		.returning({ id: conversationEvaluations.id });

	return {
		skipped: false,
		success: true,
		evaluationId: saved.id,
		overallScore: computed.overallScore,
	};
}

async function loadPersonaContext(
	personaId: string,
): Promise<{ context: PersonaContext; version: number | null }> {
	try {
		const row = await getPersonaForAdmin(personaId);
		const forbidden = row.forbiddenTopics
			.filter((t) => t.enabled)
			.map((t) => t.topic)
			.filter(Boolean);
		return {
			context: { personaId: row.id, voiceTone: row.voiceTone, forbiddenTopics: forbidden },
			version: row.version,
		};
	} catch {
		// Persona possivelmente removida; segue sem ela mas mantém o id pra rastreio.
		return {
			context: { personaId, voiceTone: null, forbiddenTopics: [] },
			version: null,
		};
	}
}
