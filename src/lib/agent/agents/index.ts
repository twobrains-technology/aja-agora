import { createHash } from "node:crypto";
import type { ToolChoice, ToolLoopAgent } from "ai";
import { getLatestBeviProposal } from "@/lib/bevi/proposal-repo";
import type { MemoryContext } from "@/lib/memory/types";
import { getCurrentClockOffset, simulatorNow } from "@/lib/utils/simulator-clock";
import type { ConversationMetadata, ExpertiseLevel, Persona } from "../personas";
import { getPersona } from "../personas-repo";
import { type ContractClosedInfo, deriveWhatsappOptinStage } from "../system-prompt";
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

/**
 * FIX-11: estado TERMINAL do fechamento pro prompt. Quando o contrato está
 * fechado (`meta.contractClosed`), o specialist precisa saber COM QUEM e O QUÊ
 * foi fechado — senão nega o fechamento e re-roda a descoberta (bug real
 * 2026-06-05: "nada chegou no nosso sistema" + recommendation_card de OUTRA
 * administradora pós-contratação).
 *
 * Fonte rica: snapshot da proposta real em `bevi_proposals` (administradora,
 * grupo, status dos documentos). Fallback: o que o meta sabe
 * (recommendedAdministradora/recommendedOffer). Falha de DB nunca derruba o
 * turno — degrada pro fallback.
 */
async function deriveContractClosedInfo(
	meta: ConversationMetadata,
	conversationId?: string,
): Promise<ContractClosedInfo | null> {
	if (meta.contractClosed !== true) return null;
	if (conversationId) {
		const row = await getLatestBeviProposal(conversationId).catch(() => null);
		if (row) {
			return {
				administradora: row.administradora ?? meta.recommendedAdministradora ?? null,
				grupo: row.grupo ?? null,
				creditValue:
					row.creditValue != null
						? Number(row.creditValue)
						: (meta.recommendedOffer?.creditValue ?? null),
				monthlyPayment:
					row.monthlyPayment != null
						? Number(row.monthlyPayment)
						: (meta.recommendedOffer?.monthlyPayment ?? null),
				proposalStatus: row.proposalStatus ?? null,
			};
		}
	}
	return {
		administradora: meta.recommendedAdministradora ?? meta.recommendedOffer?.administradora ?? null,
		creditValue: meta.recommendedOffer?.creditValue ?? null,
		monthlyPayment: meta.recommendedOffer?.monthlyPayment ?? null,
	};
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
	// FIX-5: estagio do opt-in derivado do meta — pre-reveal o prompt carrega
	// proibicao explicita de WhatsApp em texto (o guard de artifact ja existia;
	// o TEXTO vazava porque a secao de optin era incondicional no estavel).
	const whatsappOptinStage = deriveWhatsappOptinStage(meta);
	// FIX-11: estado terminal do fechamento derivado do meta + bevi_proposals.
	const contractClosedInfo = await deriveContractClosedInfo(meta, opts.conversationId);

	if (opts.toolChoice) {
		return buildAgent(row, expertise, {
			currentDate: simulatorNow(),
			memoryContext: opts.memoryContext ?? null,
			conversationId: opts.conversationId,
			channel: opts.channel,
			toolChoice: opts.toolChoice,
			whatsappOptinStage,
			contractClosedInfo,
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
			whatsappOptinStage,
			contractClosedInfo,
		});
	}

	// FIX-5: o estagio entra na cache key — agents com estagios diferentes
	// tem prompts dinamicos diferentes (nao podem compartilhar instancia).
	// FIX-11: idem pro estado de contrato fechado — hash da info (varia por
	// administradora/grupo), nao bool, pra nunca reusar prompt de OUTRO contrato.
	const ctHash = contractClosedInfo
		? createHash("sha1").update(JSON.stringify(contractClosedInfo)).digest("hex").slice(0, 8)
		: "0";
	const key = `${cacheKey(row.id, row.version, expertise, clockOffsetMs, memoryHash)}:wa-${whatsappOptinStage}:ct-${ctHash}`;

	let agent = agentCache.get(key);
	if (!agent) {
		agent = buildAgent(row, expertise, {
			currentDate: simulatorNow(),
			memoryContext: opts.memoryContext ?? null,
			conversationId: opts.conversationId,
			channel: opts.channel,
			whatsappOptinStage,
			contractClosedInfo,
		});
		agentCache.set(key, agent);
	}
	return agent;
}

export function invalidateAgentCache(): void {
	agentCache.clear();
}
