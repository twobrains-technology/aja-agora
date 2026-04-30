import { requireRole } from "@/lib/admin/require-role";
import { buildAgent } from "@/lib/agent/agents/builder";
import type { PersonaRow } from "@/lib/agent/system-prompt";
import { previewPersonaDraftSchema } from "@/lib/validations/persona";

const RATE_LIMIT_PER_MINUTE = 10;
const buckets = new Map<string, number[]>();

const DEFAULT_TOOLS = [
	"search_groups",
	"simulate_quota",
	"get_rates",
	"get_group_details",
	"recommend_groups",
	"present_group_card",
	"present_comparison_table",
	"present_simulation_result",
	"present_recommendation_card",
];

function checkRateLimit(userId: string): boolean {
	const now = Date.now();
	const cutoff = now - 60_000;
	const recent = (buckets.get(userId) ?? []).filter((t) => t > cutoff);
	if (recent.length >= RATE_LIMIT_PER_MINUTE) return false;
	recent.push(now);
	buckets.set(userId, recent);
	return true;
}

export async function POST(req: Request) {
	const { error, session } = await requireRole("admin");
	if (error) return error;

	if (!checkRateLimit(session.user.id)) {
		return Response.json(
			{ error: "Limite de testes por minuto atingido. Tente em alguns segundos." },
			{ status: 429 },
		);
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "JSON invalido" }, { status: 400 });
	}

	const parsed = previewPersonaDraftSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Dados invalidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const { sampleMessage, ...draft } = parsed.data;
	const now = new Date();
	const syntheticRow: PersonaRow = {
		id: "draft",
		displayName: draft.displayName,
		role: "specialist",
		category: draft.category,
		expertise: draft.expertise,
		voiceTone: draft.voiceTone,
		activeCampaigns: draft.activeCampaigns,
		handoffTriggers: draft.handoffTriggers,
		forbiddenTopics: draft.forbiddenTopics,
		activeTools: DEFAULT_TOOLS,
		isActive: true,
		version: 0,
		createdAt: now,
		updatedAt: now,
	};

	const agent = buildAgent(syntheticRow, "neutro");

	const start = Date.now();
	let text = "";
	try {
		const result = await agent.stream({
			messages: [{ role: "user", content: sampleMessage }],
		});
		for await (const part of result.fullStream) {
			if (part.type === "text-delta") text += part.text;
		}
	} catch (err) {
		console.error("[preview-draft] agent stream failed:", err);
		return Response.json({ error: "Falha ao executar preview" }, { status: 500 });
	}

	return Response.json({ text, modelLatencyMs: Date.now() - start });
}
