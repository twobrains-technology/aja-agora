import { resolveAgent } from "@/lib/agent/agents";
import { selectExamplesForTurn } from "@/lib/agent/example-selector";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
import { getPersona } from "@/lib/agent/personas-repo";
import { decideShowGate, type Gate, nextGate, type UserIntent } from "@/lib/agent/qualify-state";
import { renderPersonaExamplesBlock } from "@/lib/agent/system-prompt";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import type { ArtifactType } from "@/lib/chat/types";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { detectLeadFormArtifact, initializeLeadCollection } from "./lead-collection";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";
import type { Channel, ChatMessage, ProducedArtifact, TurnEvent } from "./types";

export type RunAgentResult = {
	fullResponse: string;
	artifacts: ProducedArtifact[];
	handoffSignaled: boolean;
	isConcierge: boolean;
	nextGateToFire: Gate | null;
	prefixForNextGate: string | null;
};

const LEAD_STAGE_BY_TOOL: Record<string, "engajado" | "qualificado"> = {
	simulate_quota: "engajado",
	recommend_groups: "qualificado",
};

function artifactTypeFor(toolName: string): ArtifactType {
	const short = toolName.replace("present_", "");
	return short as ArtifactType;
}

export async function* runAgentTurn(args: {
	conversationId: string;
	channel: Channel;
	currentPersona: Persona;
	meta: ConversationMetadata;
	messages: ChatMessage[];
	isUserTurn: boolean;
	userIntent?: UserIntent;
}): AsyncGenerator<TurnEvent, RunAgentResult> {
	const {
		conversationId,
		channel,
		currentPersona,
		meta,
		messages,
		isUserTurn,
		userIntent = "neutral",
	} = args;

	let fullResponse = "";
	const artifacts: ProducedArtifact[] = [];
	let handoffSignal: { triggerId?: string; reason: string } | null = null;
	const stagesEmitted = new Set<string>();

	const isConcierge = !meta.currentCategory;
	const agent = await resolveAgent(currentPersona, meta);

	// Examples filtrados por contexto do turno. Vão num system message separado
	// pra preservar o cache da Anthropic no system prompt estático (ver
	// example-selector.ts pra ranking e renderPersonaExamplesBlock pra formato).
	const row = await getPersona(currentPersona);
	const selected = selectExamplesForTurn(row.examples, {
		expertise: meta.expertiseLevel,
		category: meta.currentCategory,
		channel,
		intent: userIntent,
	});
	const examplesBlock = renderPersonaExamplesBlock(selected);
	const messagesWithExamples = examplesBlock
		? [{ role: "system" as const, content: examplesBlock }, ...messages]
		: messages;

	const result = await agent.stream({ messages: messagesWithExamples });

	for await (const part of result.fullStream) {
		switch (part.type) {
			case "text-delta":
				fullResponse += part.text;
				yield { type: "text-delta", text: part.text };
				break;
			case "tool-call": {
				const toolName = part.toolName;
				const input = part.input as Record<string, unknown>;
				const toolCallId = part.toolCallId;
				yield { type: "tool-call", toolName, input, toolCallId };

				if (toolName === "suggest_handoff") {
					const handoffInput = input as { triggerId?: string; reason?: string };
					handoffSignal = {
						triggerId: handoffInput.triggerId,
						reason: handoffInput.reason ?? "trigger satisfied",
					};
					break;
				}

				if (PRESENTATION_TOOLS.has(toolName)) {
					// PF-07: guard de duplicação do whatsapp_optin — modelo pode
					// chamar 2x em conversation longa apesar do prompt. Suprimir
					// silenciosamente se já foi mostrado.
					const isWhatsappOptin = toolName === "present_whatsapp_optin";
					if (isWhatsappOptin && !shouldEmitWhatsappOptin(meta)) {
						console.log(
							`[whatsapp-optin] guard: tool chamada 2x na mesma conversa, suprimindo artifact (conv=${conversationId})`,
						);
					} else {
						const artifactType = artifactTypeFor(toolName);
						artifacts.push({
							type: artifactType,
							payload: input,
						});
						yield { type: "artifact", artifactType, payload: input, toolCallId };
					}
				}

				const stage = LEAD_STAGE_BY_TOOL[toolName];
				if (stage && !stagesEmitted.has(stage)) {
					stagesEmitted.add(stage);
					yield { type: "lead-stage", stage };
				}
				break;
			}
		}
	}

	try {
		const finishReason = await result.finishReason;
		if (finishReason !== "stop" && finishReason !== "tool-calls") {
			console.warn(
				`[orchestrator] Agent stream ended with unexpected finishReason="${finishReason}" persona=${currentPersona}`,
			);
		}
	} catch {}

	if (handoffSignal && !isConcierge) {
		console.log(
			`[handoff] persona=${currentPersona} reason="${handoffSignal.reason}" — pausing flow`,
		);
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			handoffSuggested: true,
			handoffReason: handoffSignal.reason,
		});
		yield {
			type: "handoff",
			reason: handoffSignal.reason,
			triggerId: handoffSignal.triggerId,
		};
		return {
			fullResponse: "",
			artifacts: [],
			handoffSignaled: true,
			isConcierge,
			nextGateToFire: null,
			prefixForNextGate: null,
		};
	}

	try {
		const pmeta = await result.providerMetadata;
		const anthropicMeta = pmeta?.anthropic as
			| { cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
			| undefined;
		if (anthropicMeta) {
			const written = anthropicMeta.cacheCreationInputTokens ?? 0;
			const read = anthropicMeta.cacheReadInputTokens ?? 0;
			if (written > 0 || read > 0) {
				console.log(`[cache] write=${written} read=${read} (persona=${currentPersona})`);
			}
		}
	} catch {}

	const groupCards = artifacts.filter((a) => a.type === "group_card");
	if (groupCards.length >= 2) {
		const nonGroupCards = artifacts.filter((a) => a.type !== "group_card");
		const consolidated: ProducedArtifact = {
			type: "comparison_table",
			payload: { groups: groupCards.map((a) => a.payload) },
		};
		artifacts.length = 0;
		artifacts.push(...nonGroupCards, consolidated);
		console.log(
			`[orchestrator] Guard: consolidated ${groupCards.length} group_cards into comparison_table`,
		);
	}

	if (fullResponse) {
		await saveMessage(conversationId, "assistant", fullResponse, channel, currentPersona);
	}

	if (detectLeadFormArtifact(artifacts) && !meta.leadCollection) {
		const refreshed = await reloadMeta(conversationId);
		// Pula stages cujos dados já foram capturados conversacionalmente
		// via save_contact_name / save_contact_whatsapp (Fase 6).
		const initial = await initializeLeadCollection(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			leadCollection: initial,
		});
	}

	// PF-07: marca whatsappOptinShown=true após emitir o artifact pela 1a vez.
	// Próxima chamada da tool no mesmo conversation cai no guard acima.
	if (artifacts.some((a) => a.type === "whatsapp_optin") && !meta.whatsappOptinShown) {
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			whatsappOptinShown: true,
		});
	}

	const producedArtifact = artifacts.length > 0;
	let nextGateToFire: Gate | null = null;
	let prefixForNextGate: string | null = null;
	if (!isConcierge && !producedArtifact) {
		if (isUserTurn) {
			const userReplied = fullResponse.length > 0;
			if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed && userReplied) {
				meta.doubtsAddressed = true;
				await persistMeta(conversationId, meta);
			}
			if (meta.pendingFollowUp && userReplied) {
				meta.pendingFollowUp = false;
				await persistMeta(conversationId, meta);
			}
		}

		const refreshed = await reloadMeta(conversationId);
		// PF-08: lê contactName atual pra pausar gates enquanto nome não capturado.
		const { db } = await import("@/db");
		const { conversations } = await import("@/db/schema");
		const { eq } = await import("drizzle-orm");
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
			columns: { contactName: true },
		});
		const gate = nextGate(refreshed, { hasContactName: Boolean(conv?.contactName) });
		const shouldShow = decideShowGate({
			gate,
			intent: userIntent,
			meta: refreshed,
			isUserTurn,
		});
		if (shouldShow) {
			nextGateToFire = gate;
			if (fullResponse && gate !== "search") {
				prefixForNextGate = fullResponse;
			}
		} else if (gate !== "doubts-wait" && isUserTurn) {
			console.log(`[gate-skip] gate=${gate} intent=${userIntent} — staying conversational`);
		}
	}

	return {
		fullResponse,
		artifacts,
		handoffSignaled: false,
		isConcierge,
		nextGateToFire,
		prefixForNextGate,
	};
}
