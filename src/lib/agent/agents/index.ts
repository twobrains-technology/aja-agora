import { createHash } from "node:crypto";
import type { ToolLoopAgent } from "ai";
import type { MemoryContext } from "@/lib/memory/types";
import { getCurrentClockOffset, simulatorNow } from "@/lib/utils/simulator-clock";
import type { ConversationMetadata, ExpertiseLevel, Persona } from "../personas";
import { getPersona } from "../personas-repo";
import { buildAgent } from "./builder";

const agentCache = new Map<string, ToolLoopAgent>();

function hashMemoryBlock(context: MemoryContext | null | undefined): string {
	if (!context) return "none";
	// Hash do bloco humano: muda quando user/stage/última simulação muda.
	// 8 chars de sha1 sobre o JSON estável é suficiente — colisão prática zero
	// no escopo de uma conversa.
	const json = JSON.stringify(context.block);
	return createHash("sha1").update(json).digest("hex").slice(0, 8);
}

function cacheKey(
	id: string,
	version: number,
	expertise: ExpertiseLevel,
	clockOffsetMs: number,
	memoryHash: string,
): string {
	return `${id}:v${version}:${expertise}:${clockOffsetMs}:${memoryHash}`;
}

export async function resolveAgent(
	persona: Persona,
	meta: ConversationMetadata,
	opts: { memoryContext?: MemoryContext | null } = {},
): Promise<ToolLoopAgent> {
	const expertise: ExpertiseLevel = meta.expertiseLevel ?? "neutro";
	const row = await getPersona(persona);
	const clockOffsetMs = getCurrentClockOffset();
	const memoryHash = hashMemoryBlock(opts.memoryContext);
	const key = cacheKey(row.id, row.version, expertise, clockOffsetMs, memoryHash);

	let agent = agentCache.get(key);
	if (!agent) {
		agent = buildAgent(row, expertise, {
			currentDate: simulatorNow(),
			memoryContext: opts.memoryContext ?? null,
		});
		agentCache.set(key, agent);
	}
	return agent;
}

export function invalidateAgentCache(): void {
	agentCache.clear();
}
