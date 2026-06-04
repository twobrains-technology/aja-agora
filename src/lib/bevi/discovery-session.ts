// Sessão de descoberta por conversa — ponte entre a qualificação (passo 2 da
// jornada) e o BeviSelfContractAdapter (Trilho B). A identidade vem do gate
// "identify" (cifrada via identity.ts); as preferências de simulação vêm das
// qualifyAnswers (lance embutido opt-in + objetivo derivado do prazo).

import type {
	SelfContractIdentity,
	SelfContractSessionProvider,
	SelfContractSimulationPrefs,
} from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { loadIdentity } from "@/lib/conversation/identity";
import { reloadMeta } from "@/lib/conversation/meta";

export function prefsFromMeta(meta: ConversationMetadata): SelfContractSimulationPrefs {
	const q = meta.qualifyAnswers ?? {};
	return {
		embeddedPercentage: q.lanceEmbutido
			? ((String(q.lanceEmbutidoPercent ?? 30) as "30" | "50") ?? "30")
			: undefined,
		objective: q.objetivo === "investimento" ? "INVESTMENT" : "FAST_APPROVAL",
	};
}

/** Provider de sessão pro adapter — deps injetáveis pra teste (padrão fulfillment). */
export function discoverySessionForConversation(
	conversationId: string,
	deps: {
		loadIdentityImpl?: (id: string) => Promise<SelfContractIdentity | null>;
		reloadMetaImpl?: (id: string) => Promise<ConversationMetadata>;
	} = {},
): SelfContractSessionProvider {
	const loadIdentityImpl = deps.loadIdentityImpl ?? loadIdentity;
	const reloadMetaImpl = deps.reloadMetaImpl ?? reloadMeta;
	return {
		getIdentity: () => loadIdentityImpl(conversationId),
		getSimulationPrefs: async () => prefsFromMeta(await reloadMetaImpl(conversationId)),
	};
}
