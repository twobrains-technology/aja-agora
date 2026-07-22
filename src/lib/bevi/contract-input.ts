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

/** Re-ancora o estado na cota REAL que a administradora devolveu no fechamento.
 *
 * Até aqui o `recommendedOffer` continuava sendo a cota SIMULADA mesmo depois do
 * contrato criado — e a carta real volta com outro grupo, outra parcela, outro
 * prazo e outro lance médio. O agente seguia conversando com os números velhos:
 * dizia "ainda falta R$ 106.013 pro lance médio" quando, na cota efetivamente
 * contratada, faltavam ~R$ 23.000. Depois do fecho, a cota real é a única
 * verdade — o card já mostra a divergência, o estado também tem que virar.
 *
 * Substituição total (nunca merge): campo que a cota real não trouxe não pode
 * sobreviver da simulada. `category` fica porque é do cliente, não da cota. */
export function ancorarOfertaReal(
	meta: ConversationMetadata,
	offer: {
		administradora?: string | null;
		grupo?: string | null;
		creditValue?: number;
		monthlyPayment?: number;
		termMonths?: number;
		avgBidValue?: number;
	},
): Pick<ConversationMetadata, "recommendedOffer" | "recommendedAdministradora"> {
	const num = (v: unknown): number | undefined =>
		typeof v === "number" && Number.isFinite(v) ? v : undefined;
	return {
		recommendedAdministradora: offer.administradora ?? meta.recommendedAdministradora,
		recommendedOffer: {
			...(meta.currentCategory ? { category: meta.currentCategory } : {}),
			...(offer.grupo ? { groupId: offer.grupo } : {}),
			administradora: offer.administradora ?? undefined,
			creditValue: num(offer.creditValue) as number,
			monthlyPayment: num(offer.monthlyPayment) as number,
			termMonths: num(offer.termMonths) as number,
			avgBidValue: num(offer.avgBidValue),
		},
	};
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
	// FIX-281 (r9 onda 2, gap G-A): âncora do aviso de divergência CDC no
	// `real_offer` — o pedido ORIGINAL do cliente, MESMA precedência do hero
	// (runner.ts:656-665, FIX-261). Campo NOVO e independente de `valor` acima
	// (que segue servindo só o matching da oferta, FIX-73): `valor` é o
	// creditValue da ÚLTIMA oferta vista, nunca o que o cliente pediu de fato.
	// O aviso "você pediu X, a carta real ficou Y" tem que citar o que o CLIENTE
	// disse. `creditMax` deixa de servir aqui quando ele aceita lance embutido: o
	// alvo passa a ser o valor RECALCULADO (bem ÷ (1 − pct)) e o cliente lia
	// "você pediu uma carta de ~R$ 428.571" sem nunca ter dito esse número — a
	// conta interna do embutido apresentada como fala dele. `valorDoBemAlvo`
	// guarda o preço do bem, que é o que ele efetivamente pediu.
	const originalRequestedCreditValue =
		q.creditClampedFrom ?? q.valorDoBemAlvo ?? q.creditMentionedAtDesire ?? q.creditMax;
	const objetivo = q.objetivo ?? "contemplacao_rapida";
	const lanceEmbutido = q.lanceEmbutido ? String(q.lanceEmbutidoPercent ?? 30) : "nenhum";
	return {
		cpf: identity.cpf,
		celular: identity.celular,
		lgpd: identity.lgpd,
		segmento,
		valor,
		originalRequestedCreditValue,
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

// FIX-263 (P1, veredito Fable r5, seam PARCIAL, 2026-07-10) — o anti-refazer
// (não abrir uma 2ª proposta REAL de administradora diferente) era REGRA-NO-
// PROMPT e falhou ao vivo 2×: o agente negou a proposta RODOBENS registrada,
// afirmou falsamente que a ITAÚ estava registrada (sem check_proposal_status)
// e reabriu o contract_form da ITAÚ — a 1 clique de uma 2ª proposta real (CPF
// + consulta de bureau) na MESMA conversa. Lei 1/4: o guard vira código, não
// fica no prompt. `route.ts` (contract-submit) chama isto ANTES de startContract
// com a administradora já registrada em `bevi_proposals` (getLatestBeviProposal)
// — nunca confia no que o modelo afirma sobre o estado da proposta.

/** A administradora PEDIDA neste fechamento conflita com uma já REGISTRADA
 * nesta conversa? Mesma normalização do FIX-251 (acento/caixa não disparam
 * falso-positivo: "Itau" === "ITAÚ"). Sem proposta registrada ainda, ou sem
 * administradora pedida (defensivo), nunca conflita — só bloqueia quando há
 * DUAS administradoras REAIS e DIFERENTES em jogo. */
export function administradoraConflictsWithRegisteredProposal(
	registeredAdministradora: string | null | undefined,
	requestedAdministradora: string | null | undefined,
): boolean {
	if (!registeredAdministradora || !requestedAdministradora) return false;
	return (
		normalizeAdministradora(registeredAdministradora) !==
		normalizeAdministradora(requestedAdministradora)
	);
}
