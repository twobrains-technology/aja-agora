/**
 * Concierge agent — front door of the WhatsApp experience.
 *
 * Singleton: config 100% static. No tools — routing decisions are made by the
 * Haiku classifier (in processor.ts) BEFORE the AI runs. Sofia's job narrows
 * to greeting + answering general questions about consórcio.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import { CONCIERGE_PROMPT } from "../system-prompt";

const anthropic = createAnthropic();

export const conciergeAgent = new ToolLoopAgent({
	model: anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-6"),
	instructions: [
		{
			role: "system",
			content: CONCIERGE_PROMPT,
			providerOptions: {
				anthropic: { cacheControl: { type: "ephemeral" as const } },
			},
		},
	],
	tools: {},
	stopWhen: stepCountIs(1),
});
