import { createHash } from "node:crypto";
import type { ToolChoice, ToolLoopAgent } from "ai";
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
	opts: {
		memoryContext?: MemoryContext | null;
		/**
		 * UUID da conversation atual — propagado pro `buildAgent`, que passa
		 * pra factory `buildConsorcioTools({ conversationId })` (closure das
		 * tools sensíveis: save_contact_name, save_contact_whatsapp,
		 * present_lead_form).
		 *
		 * Quando passado, BYPASSA o cache de agents — o closure carrega o
		 * conversationId atual, então NÃO podemos reutilizar agent cached
		 * que carrega closure de OUTRA conversation. Cada turno de
		 * specialist constrói novo agent ad-hoc — ToolLoopAgent é leve
		 * (sem chamada I/O na construção), trade-off aceitável vs
		 * correctness (BUG-CONVERSATION-ID-HALLUCINATION).
		 *
		 * Concierge (no-tools) ainda usa cache normal — sem closure de
		 * conversationId, agent é fungível entre conversations.
		 */
		conversationId?: string;
		channel?: "web" | "whatsapp";
		/**
		 * Quando passado, BYPASSA o cache de agents e constrói uma instância
		 * ad-hoc com esse `toolChoice`. Usado no fix BUG-SHORT-GREETING-
		 * AFTER-NAME pra forçar `save_contact_name` quando o orchestrator
		 * detecta "user respondeu nome" (cf. `detect-name-turn.ts`).
		 *
		 * Cache bypass é OK porque o caso ocorre apenas 1x por conversa
		 * (contactName fica capturado depois).
		 */
		// biome-ignore lint/suspicious/noExplicitAny: ToolChoice é genérico sobre o ToolSet do agent — passamos por aqui só pra repassar pro buildAgent.
		toolChoice?: ToolChoice<any>;
	} = {},
): Promise<ToolLoopAgent> {
	const expertise: ExpertiseLevel = meta.expertiseLevel ?? "neutro";
	const row = await getPersona(persona);
	const clockOffsetMs = getCurrentClockOffset();
	const memoryHash = hashMemoryBlock(opts.memoryContext);

	// Bypass de cache: toolChoice forçado é caso raro (1x/conversa) e cada
	// turno pode ter toolName diferente — cachear seria over-engineering e
	// reaproveitaria agent c/ toolChoice errado.
	if (opts.toolChoice) {
		return buildAgent(row, expertise, {
			currentDate: simulatorNow(),
			memoryContext: opts.memoryContext ?? null,
			conversationId: opts.conversationId,
			channel: opts.channel,
			toolChoice: opts.toolChoice,
		});
	}

	// Specialists (role !== "concierge") carregam closure de conversationId
	// nas tools sensíveis — não dá pra reutilizar instância cached entre
	// conversations diferentes. Bypass de cache pra specialists quando
	// conversationId é passado.
	const isSpecialist = row.role !== "concierge";
	if (isSpecialist && opts.conversationId) {
		return buildAgent(row, expertise, {
			currentDate: simulatorNow(),
			memoryContext: opts.memoryContext ?? null,
			conversationId: opts.conversationId,
			channel: opts.channel,
		});
	}

	const key = cacheKey(row.id, row.version, expertise, clockOffsetMs, memoryHash);

	let agent = agentCache.get(key);
	if (!agent) {
		agent = buildAgent(row, expertise, {
			currentDate: simulatorNow(),
			memoryContext: opts.memoryContext ?? null,
			conversationId: opts.conversationId,
			channel: opts.channel,
		});
		agentCache.set(key, agent);
	}
	return agent;
}

export function invalidateAgentCache(): void {
	agentCache.clear();
}
