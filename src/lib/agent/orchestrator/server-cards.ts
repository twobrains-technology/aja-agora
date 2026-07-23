// FIX-246 (rodada 3, Fable r2 — causa-raiz do veredito 4/10): os cards
// `two_paths`/`embedded_bid`/`scarcity` dependiam de o LLM OBEDECER um
// directive pra chamar `present_X` — 0 emissões em 7 oportunidades ao vivo,
// porque o invariante crítico ficou no PROMPT, não em CÓDIGO (viola Lei 1 —
// LLM não dirige o fluxo — e Lei 4 — invariante crítico vira código).
//
// Este módulo monta os payloads coagidos DIRETO do `meta.recommendedOffer`
// (mesma coerção que o runner.ts já aplica quando o LLM chama a tool) pra o
// handler emitir o card server-side, determinístico, sem tool-call nenhuma.

import type { ConversationMetadata } from "@/lib/agent/personas";
import { coerceEmbeddedBidPayload } from "./embedded-bid-payload";
import type { RevealGroupIndex, RevealGroupLike } from "./recommendation-payload";
import { coerceScarcityPayload } from "./scarcity-payload";
import { CANONICAL_TOPIC_IDS, resolveTopicPickerPayload } from "./topic-catalog";
import { coerceTwoPathsPayload } from "./two-paths-payload";

export type ServerCard = { payload: Record<string, unknown> };

export function buildTwoPathsCard(meta: ConversationMetadata): ServerCard {
	return { payload: coerceTwoPathsPayload({}, meta.recommendedOffer ?? null) };
}

export function buildEmbeddedBidCard(meta: ConversationMetadata): ServerCard {
	return {
		payload: coerceEmbeddedBidPayload(
			{},
			meta.recommendedOffer ?? null,
			meta.qualifyAnswers?.valorDoBemAlvo ?? meta.qualifyAnswers?.creditMax,
		),
	};
}

/** Sem `groupId` ancorado (reveal anterior ao FIX-246, ou nenhuma oferta
 * recomendada ainda) não fabrica — mesmo comportamento de "sem grupo
 * utilizável" do `coerceScarcityPayload` (nunca inventa `availableSlots`).
 *
 * FIX-367: o snapshot (`meta.recommendedOffer`) precisa carregar
 * `availableSlots` (ver dial-payload.ts) — sem repassá-lo aqui pro índice, o
 * card ficava IMPOSSÍVEL de mostrar um número real mesmo quando a oferta Bevi
 * trazia o dado (o `RevealGroupLike` construído aqui é a ÚNICA fonte que
 * `coerceScarcityPayload` enxerga pós-reveal).
 *
 * FIX-369 (rodada 2, root cause real — 0/3 personas nunca viram o card):
 * `coerceScarcityPayload` já devolve `availableSlots: undefined` quando a
 * Bevi não trouxe o dado pro grupo — e o componente (`Scarcity`, scarcity.tsx)
 * já renderiza `null` nesse caso ("melhor card nenhum que número inventado").
 * Mas ESTA função devolvia um `ServerCard` não-nulo mesmo assim (só checava
 * `groupId`), então `dispatchDecisionCascade`/`pipeClosingCeremony` (que só
 * testam `if (scarcityCard)`) seguiam EMITINDO o artifact — persistido no
 * banco, mandado no stream, e invisível na tela. Nenhum bug de bypass/tool-
 * call: o card "existia" tecnicamente mas nunca aparecia, porque a condição
 * de "vale a pena emitir" morava só no componente React, duplicada (e
 * desalinhada) da condição real. Espelha aqui a MESMA checagem do componente
 * ANTES de devolver o card — invariante único, não duas cópias divergentes. */
export function buildScarcityCard(meta: ConversationMetadata): ServerCard | null {
	const offer = meta.recommendedOffer;
	const groupId = offer?.groupId;
	if (!groupId) return null;
	const index: RevealGroupIndex = new Map<string, RevealGroupLike>([
		[
			groupId,
			{
				id: groupId,
				administradora: offer.administradora,
				availableSlots: offer.availableSlots,
			},
		],
	]);
	const payload = coerceScarcityPayload({ groupId }, index);
	if (typeof payload.availableSlots !== "number" || !Number.isFinite(payload.availableSlots)) {
		return null;
	}
	return { payload };
}

/** FIX-253 (rodada 4, veredito Fable FINAL §3, causa-raiz do 0-scarcity no
 * Fluxo A): `present_decision_prompt` estava no toolset do LLM em
 * reveal/closing — o modelo chamava a tool DIRETO, num turno de usuário
 * comum, bypassando o ramo `nextGateToFire === "decision"` do orchestrator
 * (que é quem dispara o scarcity server-side ANTES do decision_prompt). O
 * card de decisão em si NUNCA precisou de dado real da Bevi (payload só
 * carrega `administradora` de contexto) — emissão SERVER-SIDE determinística
 * mata a tool por completo, mesma receita do FIX-246. */
export function buildDecisionPromptCard(meta: ConversationMetadata): ServerCard {
	return {
		payload: {
			...(meta.recommendedAdministradora ? { administradora: meta.recommendedAdministradora } : {}),
		},
	};
}

/** FIX-280 (loop r9, baseline Sonnet 3/10, G4): `present_whatsapp_optin` era
 * puramente LLM-discricionário — a tool ficava disponível em reveal/closing
 * (via `shouldEmitWhatsappOptin`), mas CHAMAR ou não continuava 100% a
 * critério do modelo. Mesmo toolset, mesmo estado de sistema, resultado
 * divergente entre 2 fluxos estruturalmente idênticos (mario-sem-lance
 * turno 7 chamava; madalena, no mesmo ponto, não). O payload NUNCA dependeu
 * de dado do LLM (schema vazio — "o sistema preenche") — candidato direto
 * pra emissão SERVER-SIDE determinística, mesma receita do FIX-246/253. */
export function buildWhatsappOptinCard(meta: ConversationMetadata): ServerCard {
	return {
		payload: {
			...(meta.contactPhone ? { knownPhone: meta.contactPhone } : {}),
		},
	};
}

/** FIX-309 (rodada 10 onda 4 — investigação de causa-raiz): `present_topic_
 * picker` era 100% LLM-discricionário — 0 emissões em 2 dossiês limpos
 * (Madalena/Mario), mesma classe de bug do FIX-246/253/280. Os 4 tópicos SÃO
 * o catálogo canônico inteiro (topic-catalog.ts) — payload estático, sem
 * dado de conversa nenhum, emitido no ponto pós-`experience` quando o
 * usuário escolhe "tenho dúvidas" (orchestrator/index.ts). */
export function buildTopicPickerCard(): ServerCard {
	return { payload: resolveTopicPickerPayload({ topics: [...CANONICAL_TOPIC_IDS] }) };
}
