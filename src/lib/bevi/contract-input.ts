// Derivação canônica do input do `startContract` (passo 5 "Contratar"). Módulo
// ÚNICO consumido pelo web (route.ts) e pelo WhatsApp (contract-capture.ts): a
// mesma proposta real sai dos dois canais com segmento/valor/objetivo/lance
// idênticos — sem drift entre canais (FIX-25 / MC-5).
//
// LGPD: o `cpf`/`celular` chegam SÓ aqui em memória (resolvidos via loadIdentity,
// decifrados). Esta função não loga, não persiste — só monta o objeto pro gateway.

import { categoryToBeviSegment } from "@/lib/adapters/bevi/offer-mapper";
import { normalizeAdministradora } from "@/lib/agent/orchestrator/choose-offer";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { StartContractInput } from "./fulfillment";

/** Identidade + consentimento resolvidos pelo caller (web ou WhatsApp). */
export interface ContractIdentityInput {
	cpf: string;
	celular: string;
	lgpd: boolean;
}

/** Vínculos de funil resolvidos pelo caller (web ou WhatsApp). FIX-48: o `leadId`
 * é resolvido no momento do fechamento e PRECISA chegar à proposta — sem ele a
 * raia trava em `qualificado` (createBeviProposal pula a transição). */
export interface ContractLinkInput {
	leadId?: string | null;
}

/** Monta o input do `startContract` a partir do estado da conversa + identidade.
 * Os defaults (valor 50000, objetivo rápido, lance "nenhum") espelham o web. */
export function buildStartContractInput(
	meta: ConversationMetadata,
	identity: ContractIdentityInput,
	links: ContractLinkInput = {},
): StartContractInput {
	const q = meta.qualifyAnswers ?? {};
	const segmento = categoryToBeviSegment(meta.currentCategory ?? null);
	// FIX-251 (P0, veredito Fable FINAL §N-A, defesa em profundidade): o
	// runner já re-ancora recommendedOffer/recommendedAdministradora juntos no
	// fechamento (contract_form) e no what-if (choose-offer.ts), mas se por
	// algum caminho não coberto os dois campos divergirem — snapshot de UMA
	// administradora, recommendedAdministradora de OUTRA — o creditValue do
	// snapshot é de uma oferta que o usuário JÁ abandonou. Nunca usa esse
	// número stale: cai pro teto pedido (creditMax/creditMin), nunca pra
	// carta de uma administradora diferente da confirmada.
	const offerMatchesCurrentAdmin =
		!meta.recommendedOffer?.administradora ||
		!meta.recommendedAdministradora ||
		normalizeAdministradora(meta.recommendedOffer.administradora) ===
			normalizeAdministradora(meta.recommendedAdministradora);
	// FIX-73: o fechamento reusa o crédito da oferta REAL recomendada
	// (snapshot persistido no reveal — FIX-6/FIX-C2), NUNCA re-deriva de
	// creditMax (teto que o usuário pediu, não a oferta que ele viu). Sem
	// isso a Bevi devolvia uma cota nova baseada no teto, divergindo do
	// número que o card de recomendação anunciou (bait-and-switch, jornada
	// AUTO 2026-07-02). creditMax/creditMin seguem como fallback defensivo
	// (fechamento sem reveal já é bloqueado a montante pelo guard revealCompleted).
	const valor =
		(offerMatchesCurrentAdmin ? meta.recommendedOffer?.creditValue : undefined) ??
		q.creditMax ??
		q.creditMin ??
		50000;
	const objetivo = q.objetivo ?? "contemplacao_rapida";
	const lanceEmbutido = q.lanceEmbutido ? String(q.lanceEmbutidoPercent ?? 30) : "nenhum";
	return {
		cpf: identity.cpf,
		celular: identity.celular,
		lgpd: identity.lgpd,
		segmento,
		valor,
		objetivo,
		lanceEmbutido,
		// Fechamento prefere a MESMA administradora que o usuário decidiu
		// (BUG-ADMIN-TROCADA-NO-FECHAMENTO).
		administradoraPreferida: meta.recommendedAdministradora ?? null,
		// E o MESMO prazo que ele viu — desempata o matching dentro da admin
		// (matching preparatório 2026-06-28). O snapshot da oferta ativa traz o
		// prazo — mesma checagem de consistência do `valor` acima.
		prazoPreferido:
			(offerMatchesCurrentAdmin ? meta.recommendedOffer?.termMonths : undefined) ?? null,
		// FIX-48: vincula a proposta ao lead já existente da conversa pra a raia
		// avançar (qualificado→proposta_enviada). null explícito (nunca undefined).
		leadId: links.leadId ?? null,
	};
}
