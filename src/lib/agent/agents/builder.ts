import { createAnthropic } from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import {
	buildConciergePrompt,
	buildSpecialistPrompt,
	type ExpertiseLevel,
	type PersonaRow,
} from "../system-prompt";
import { consorcioTools } from "../tools/ai-sdk";

const anthropic = createAnthropic();

type ConsorcioToolName = keyof typeof consorcioTools;

function selectTools(
	activeTools: string[],
): Record<string, (typeof consorcioTools)[ConsorcioToolName]> {
	const out: Record<string, (typeof consorcioTools)[ConsorcioToolName]> = {};
	for (const name of activeTools) {
		if (name in consorcioTools) {
			const key = name as ConsorcioToolName;
			out[name] = consorcioTools[key];
		}
	}
	return out;
}

export function buildAgent(row: PersonaRow, expertise: ExpertiseLevel = "neutro"): ToolLoopAgent {
	const isConcierge = row.role === "concierge";
	const blocks = isConcierge ? buildConciergePrompt(row) : buildSpecialistPrompt(row, expertise);
	// Specialists always have suggest_handoff available — it's a system primitive,
	// not an admin-toggleable behavior. Concierge doesn't qualify users so it skips.
	const tools = isConcierge
		? {}
		: { ...selectTools(row.activeTools), suggest_handoff: consorcioTools.suggest_handoff };

	const instructions = blocks.dynamic
		? [
				{
					role: "system" as const,
					content: blocks.stable,
					providerOptions: {
						anthropic: { cacheControl: { type: "ephemeral" as const } },
					},
				},
				{ role: "system" as const, content: blocks.dynamic },
			]
		: [
				{
					role: "system" as const,
					content: blocks.stable,
					providerOptions: {
						anthropic: { cacheControl: { type: "ephemeral" as const } },
					},
				},
			];

	return new ToolLoopAgent({
		model: anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-6"),
		instructions,
		tools,
		stopWhen: stepCountIs(isConcierge ? 1 : 10),
	});
}
