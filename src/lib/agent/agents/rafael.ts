/**
 * Rafael agent — especialista em consórcio de automóvel (cobre carro e moto).
 *
 * Factory pattern: instructions vary by `expertiseLevel`.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import { type ConversationMetadata, getSpecialistPrompt } from "../personas";
import { consorcioTools } from "../tools/ai-sdk";

const anthropic = createAnthropic();

export function buildRafaelAgent(meta: ConversationMetadata) {
	const blocks = getSpecialistPrompt("auto", meta.expertiseLevel ?? "neutro");
	return new ToolLoopAgent({
		model: anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-6"),
		instructions: [
			{
				role: "system",
				content: blocks.stable,
				providerOptions: {
					anthropic: { cacheControl: { type: "ephemeral" as const } },
				},
			},
			{
				role: "system",
				content: blocks.dynamic,
			},
		],
		tools: consorcioTools,
		stopWhen: stepCountIs(10),
	});
}
