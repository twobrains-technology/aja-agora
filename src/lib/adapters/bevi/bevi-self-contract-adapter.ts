// BeviSelfContractAdapter — Discovery REAL (passos 3-4 da jornada canônica)
// via Trilho B self-contract. Substitui o MockBeviAdapter: grupos, parcelas,
// taxas e cenários de lance vêm das ofertas reais da Bevi (~68 campos), nunca
// de JSON fictício (REGRA: docs/jornada/CONTEXT.md).
//
// Sessão por conversa: a Bevi exige CPF+celular+LGPD pra simular (D1 — CPF
// antecipado no fim do passo 2). O adapter recebe um provider de sessão e
// mantém UMA proposta de descoberta por instância (instância por conversa),
// com cache de ofertas por (segmento, valor) — chat precisa responder <3s.

import type {
	AdministradoraAdapter,
	GetGroupDetailsParams,
	GetRatesParams,
	GroupDetails,
	GroupSummary,
	QuotaSimulation,
	RateInfo,
	SearchGroupsParams,
	SimulateQuotaParams,
} from "../types";
import { DuplicatedProposalError } from "./bevi-errors";
import {
	type BeviOffer,
	beviOfferToGroupSummary,
	beviOfferToQuotaSimulation,
	beviSegmentToCategory,
	categoryToBeviSegment,
} from "./offer-mapper";
import type { BeviSelfContractClient } from "./self-contract-client";

/** Identidade mínima exigida pelo create-proposal do Trilho B. */
export interface SelfContractIdentity {
	cpf: string;
	celular: string;
}

export interface SelfContractSimulationPrefs {
	/** Opt-in de lance embutido do passo 2 (docx). Omitido = sem embutido. */
	embeddedPercentage?: "30" | "50";
	/** Derivado do prazo desejado (docx: "o mais rápido" → FAST_APPROVAL). */
	objective?: "FAST_APPROVAL" | "INVESTMENT";
}

/** Provider de sessão por conversa — identidade e preferências vêm da
 * qualificação (qualifyAnswers), persistidas no meta da conversation. */
export interface SelfContractSessionProvider {
	getIdentity(): Promise<SelfContractIdentity | null>;
	getSimulationPrefs(): Promise<SelfContractSimulationPrefs>;
}

/** Busca disparada ANTES da identidade coletada — erro de orquestração, não de
 * dados. O funil (gate identify, Fase 2) garante a ordem; este erro é a tripwire
 * que impede silenciosamente cair em dado inventado. */
export class IdentityNotCollectedError extends Error {
	constructor() {
		super(
			"Descoberta real exige CPF+celular coletados (gate identify do passo 2). " +
				"Sem identidade não há simulação na Bevi — e mock é proibido.",
		);
		this.name = "IdentityNotCollectedError";
	}
}

export class BeviSelfContractAdapter implements AdministradoraAdapter {
	private proposalReady = false;
	private currentSegment: string | null = null;
	/** Cache por `${segmento}:${valor}` — ofertas da última simulação. */
	private readonly offerCache = new Map<string, BeviOffer[]>();
	/** Índice quotaId → oferta, pra simulateQuota/getGroupDetails O(1). */
	private readonly offerIndex = new Map<string, BeviOffer>();

	constructor(
		private readonly client: BeviSelfContractClient,
		private readonly session: SelfContractSessionProvider,
	) {}

	async searchGroups(params: SearchGroupsParams): Promise<GroupSummary[]> {
		const value = params.creditMax ?? params.creditMin;
		if (!value || value <= 0) {
			throw new Error("searchGroups exige creditMax/creditMin > 0 (valor do bem do passo 2).");
		}
		const offers = await this.ensureOffers(categoryToBeviSegment(params.category), value);
		return offers.map(beviOfferToGroupSummary);
	}

	async simulateQuota(params: SimulateQuotaParams): Promise<QuotaSimulation> {
		const offer = this.offerIndex.get(params.groupId);
		if (!offer) {
			throw new Error(
				`Oferta/grupo "${params.groupId}" não encontrado na descoberta atual — ` +
					"refaça a busca antes de simular (ofertas Bevi expiram).",
			);
		}
		return beviOfferToQuotaSimulation(offer);
	}

	async getGroupDetails(params: GetGroupDetailsParams): Promise<GroupDetails> {
		const offer = this.offerIndex.get(params.groupId);
		if (!offer) {
			throw new Error(`Oferta/grupo "${params.groupId}" não encontrado na descoberta atual.`);
		}
		return {
			id: offer.quotaId,
			administradora: offer.bankLabel ?? offer.bank,
			groupNumber: offer.group,
			category: beviSegmentToCategory(offer.productType ?? ""),
			creditValue: offer.finalValue,
			termMonths: offer.term,
			totalParticipants: offer.quantityOfQuotas ?? 0,
			availableSlots: offer.monthlyAwardedQuotas ?? 0,
			adminFeePercent: round2(offer.adminFee * 100),
			reserveFundPercent: round2((offer.reserveFundFee ?? 0) * 100),
			monthlyPayment: round2(offer.importedInstallmentValue ?? offer.installmentValue ?? 0),
			// A oferta self-contract não traz histórico por assembleia — exibir
			// liquidez via monthlyAwardedQuotas; nunca inventar histórico.
			contemplationHistory: [],
			nextAssembly: offer.proximaAssembleia ?? "",
			startDate: offer.validityStart ?? "",
			status: "active",
		};
	}

	async getRates(params: GetRatesParams): Promise<RateInfo[]> {
		const seen = new Map<string, RateInfo>();
		for (const offer of this.offerIndex.values()) {
			const administradora = offer.bankLabel ?? offer.bank;
			const category = beviSegmentToCategory(offer.productType ?? "");
			if (params.category && category !== params.category) continue;
			if (params.administradora && administradora !== params.administradora) continue;
			if (seen.has(administradora)) continue;
			seen.set(administradora, {
				administradora,
				category,
				adminFeePercent: round2(offer.adminFee * 100),
				reserveFundPercent: round2((offer.reserveFundFee ?? 0) * 100),
				insurancePercent: round2((offer.insuranceFee ?? 0) * 100),
				updatedAt: new Date().toISOString(),
			});
		}
		return [...seen.values()];
	}

	/** Garante proposta criada + segmento gravado + simulação cacheada. */
	private async ensureOffers(segment: string, value: number): Promise<BeviOffer[]> {
		const key = `${segment}:${value}`;
		const cached = this.offerCache.get(key);
		if (cached) return cached;

		if (!this.proposalReady) {
			const identity = await this.session.getIdentity();
			if (!identity) throw new IdentityNotCollectedError();
			try {
				await this.client.createProposal({ cpf: identity.cpf, celular: identity.celular });
			} catch (err) {
				// Proposta ativa pro device → o servidor retoma; seguimos nos steps.
				if (!(err instanceof DuplicatedProposalError)) throw err;
			}
			this.proposalReady = true;
		}

		if (this.currentSegment !== segment) {
			await this.client.setSegment(segment);
			this.currentSegment = segment;
		}

		const prefs = await this.session.getSimulationPrefs();
		const offers = await this.client.simulate({
			simulationValue: value,
			embeddedPercentage: prefs.embeddedPercentage,
			objective: prefs.objective,
		});

		this.offerCache.set(key, offers);
		for (const offer of offers) this.offerIndex.set(offer.quotaId, offer);
		return offers;
	}
}

const round2 = (n: number) => Math.round(n * 100) / 100;
