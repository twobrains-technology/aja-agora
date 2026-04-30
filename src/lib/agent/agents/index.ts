import type { ToolLoopAgent } from "ai";
import type { ConversationMetadata, ExpertiseLevel, Persona } from "../personas";
import { getPersona } from "../personas-repo";
import { buildAgent } from "./builder";

const agentCache = new Map<string, ToolLoopAgent>();

function cacheKey(id: string, version: number, expertise: ExpertiseLevel): string {
	return `${id}:v${version}:${expertise}`;
}

export async function resolveAgent(
	persona: Persona,
	meta: ConversationMetadata,
): Promise<ToolLoopAgent> {
	const expertise: ExpertiseLevel = meta.expertiseLevel ?? "neutro";
	const row = await getPersona(persona);
	const key = cacheKey(row.id, row.version, expertise);

	let agent = agentCache.get(key);
	if (!agent) {
		agent = buildAgent(row, expertise);
		agentCache.set(key, agent);
	}
	return agent;
}

export function invalidateAgentCache(): void {
	agentCache.clear();
}
