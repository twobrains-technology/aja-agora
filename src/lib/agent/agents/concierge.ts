/**
 * Concierge agent — front door of the WhatsApp experience.
 *
 * Singleton: config 100% static (no expertise/subtype to inject), so we
 * instantiate once and reuse across requests.
 *
 * Pattern follows Vercel AI SDK 6 ToolLoopAgent recommendation:
 * https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import { CONCIERGE_PROMPT } from "../system-prompt";
import { conciergeTools } from "../tools/concierge";

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
	tools: conciergeTools,
	stopWhen: stepCountIs(1),
});
