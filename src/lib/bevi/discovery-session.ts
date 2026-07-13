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
import { LANCE_EMBUTIDO_DEFAULT_PERCENT } from "@/lib/agent/qualify-config";
import { loadIdentity } from "@/lib/conversation/identity";
import { reloadMeta } from "@/lib/conversation/meta";

// FIX-219 (Ata 2026-07-04, item 4): a Bevi não informa se a cota aceita
// embutido, e a conversa de lance só acontece PÓS-reveal (FIX-215) — na 1ª
// busca `lanceEmbutido` nem foi perguntado ainda. Não dá mais pra gatear no
// opt-in: assume-se o teto histórico (~30%) sempre; o adapter varre COM e SEM
// embutido (offersForValue) e une os resultados. `lanceEmbutidoPercent`
// explícito (quando já coletado) ainda prevalece sobre o default.
export function prefsFromMeta(meta: ConversationMetadata): SelfContractSimulationPrefs {
	const q = meta.qualifyAnswers ?? {};
	return {
		embeddedPercentage: String(
			q.lanceEmbutidoPercent ?? LANCE_EMBUTIDO_DEFAULT_PERCENT,
		) as "30" | "50",
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
