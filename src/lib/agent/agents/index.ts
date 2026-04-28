/**
 * Agent resolver — given the active persona and current conversation
 * metadata, returns the right ToolLoopAgent instance to drive the next turn.
 *
 * Concierge is a singleton (static config). Specialists are built per request
 * because their instructions depend on `expertiseLevel`.
 * See agents/{helena,rafael,camila}.ts for details.
 *
 * Pattern: https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk
 */

import type { ConversationMetadata, Persona } from "../personas";
import { buildCamilaAgent } from "./camila";
import { conciergeAgent } from "./concierge";
import { buildHelenaAgent } from "./helena";
import { buildRafaelAgent } from "./rafael";

export function resolveAgent(persona: Persona, meta: ConversationMetadata) {
	switch (persona) {
		case "concierge":
			return conciergeAgent;
		case "imovel":
			return buildHelenaAgent(meta);
		case "auto":
			return buildRafaelAgent(meta);
		case "servicos":
			return buildCamilaAgent(meta);
	}
}

export { conciergeAgent } from "./concierge";
export { buildHelenaAgent } from "./helena";
export { buildRafaelAgent } from "./rafael";
export { buildCamilaAgent } from "./camila";
