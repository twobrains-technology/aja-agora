/**
 * Helena agent — especialista em consórcio de imóvel.
 *
 * Factory pattern: instantiated per request because instructions vary by
 * `expertiseLevel` (leigo/expert/neutro). Vercel AI SDK does not expose a
 * per-call instructions override on ToolLoopAgent, so we follow the
 * recommended approach of building a fresh agent with the right config.
 * Issue tracking dynamic instructions: https://github.com/vercel/ai/issues/10514
 *
 * Cache control: the `stable` block (identity + hooks + base rules) is marked
 * ephemeral so Anthropic caches it for ~5min — across turns inside the same
 * conversation we hit the cache and pay 10% of input cost on that prefix.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import { type ConversationMetadata, getSpecialistPrompt } from "../personas";
import { consorcioTools } from "../tools/ai-sdk";

const anthropic = createAnthropic();

export function buildHelenaAgent(meta: ConversationMetadata) {
	const blocks = getSpecialistPrompt("imovel", meta.expertiseLevel ?? "neutro");
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
