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
	ofertaEhCoerente,
	beviOfferToQuotaSimulation,
	beviSegmentToCategory,
	categoryToBeviSegment,
	normalizeAdministradoraName,
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

// ── FIX-70: sweep sequencial multi-faixa ────────────────────────────────────
// A Bevi é stateful (1 proposta ativa por device — cookbook §3) → batch SÓ
// sequencial (re-PATCH do step `simulation` na mesma proposta). O sweep varre o
// alvo + vizinhas pra enriquecer o índice cumulativo (sobrevive a conversa) com
// um espectro real de ofertas pra comparar. Defaults conservadores; o spike
// FIX-69 calibra (latência/rate-limit não documentados no cookbook).

const DEFAULT_SWEEP_SPREAD = [0.7, 1.0, 1.3] as const;
/** Piso de crédito do segmento (cookbook §5a / MinCreditError) — vizinha abaixo
 * volta 200 com offers vazio; não varrer no vácuo. */
const DEFAULT_CREDIT_FLOOR = 15_000;

export interface SweepValueOpts {
	/** Multiplicadores em torno do alvo. 1.0 = o próprio alvo. Default [0.7,1,1.3]. */
	spread?: number[];
	/** Piso de crédito — vizinhas abaixo são descartadas. Default 15.000. */
	floor?: number;
}

/** Arredonda a faixa pra um passo redondo por magnitude (cai em grupos reais e
 * deduplica vizinhas near-equal). O ALVO nunca é arredondado (é o valor exato
 * do usuário); só as vizinhas derivadas. */
function roundBand(value: number): number {
	if (value < 50_000) return Math.round(value / 5_000) * 5_000;
	if (value < 200_000) return Math.round(value / 10_000) * 10_000;
	return Math.round(value / 25_000) * 25_000;
}

/** Deriva os valores a varrer a partir do alvo: alvo (exato) PRIMEIRO, depois
 * vizinhas arredondadas (±spread), deduplicadas e acima do piso de crédito.
 * Puro/determinístico — testado em isolamento (FIX-70). */
export function deriveSweepValues(target: number, opts: SweepValueOpts = {}): number[] {
	const spread = opts.spread ?? [...DEFAULT_SWEEP_SPREAD];
	const floor = opts.floor ?? DEFAULT_CREDIT_FLOOR;
	const result: number[] = [target];
	const seen = new Set<number>([target]);
	for (const factor of spread) {
		if (factor === 1) continue; // o alvo já entrou (exato)
		const neighbor = roundBand(target * factor);
		if (neighbor >= floor && !seen.has(neighbor)) {
			seen.add(neighbor);
			result.push(neighbor);
		}
	}
	return result;
}

/** Config do sweep — parametrizável (testes injetam gapMs:0). */
export interface SweepConfig {
	spread: number[];
	floor: number;
	/** Gap entre simulações sequenciais (cookbook §6 ~400ms). */
	gapMs: number;
	/** Budget de tempo total do sweep — não lança nova vizinha se estourar. */
	maxSweepMs: number;
}

const DEFAULT_SWEEP_CONFIG: SweepConfig = {
	spread: [...DEFAULT_SWEEP_SPREAD],
	floor: DEFAULT_CREDIT_FLOOR,
	gapMs: 400,
	maxSweepMs: 10_000,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

/** FIX-72 — o groupId pedido NÃO está no `offerIndex` da descoberta atual: id
 * fabricado pela LLM (`auto-180k`, `auto-180k-kairo`), oferta expirada (TTL Bevi)
 * ou busca ainda não feita. NÃO é falha de dados nem de rede — é sinal pra
 * RE-BUSCAR. Tipado de propósito: a tool captura por `instanceof` e devolve uma
 * diretiva acionável (re-busca / id literal) em vez de propagar erro cru, que o
 * AI SDK converteria em tool-error "instabilidade" travando o usuário. É a FONTE
 * DA VERDADE do conjunto (o adapter sabe o que existe), desacoplada do formato do
 * id — funciona pra qualquer administradora atrás do adapter pattern. */
export class GroupNotInDiscoveryError extends Error {
	constructor(public readonly groupId: string) {
		super(
			`Oferta/grupo "${groupId}" não encontrado na descoberta atual — ` +
				"refaça a busca antes de simular/detalhar (ofertas Bevi expiram; o id vem literal da busca).",
		);
		this.name = "GroupNotInDiscoveryError";
	}
}

export class BeviSelfContractAdapter implements AdministradoraAdapter {
	private proposalReady = false;
	private currentSegment: string | null = null;
	/** Cache por `${segmento}:${valor}` — ofertas da última simulação. */
	private readonly offerCache = new Map<string, BeviOffer[]>();
	/** Índice quotaId → oferta, pra simulateQuota/getGroupDetails O(1). */
	private readonly offerIndex = new Map<string, BeviOffer>();
	private readonly sweepConfig: SweepConfig;

	constructor(
		private readonly client: BeviSelfContractClient,
		private readonly session: SelfContractSessionProvider,
		sweepConfig: Partial<SweepConfig> = {},
	) {
		this.sweepConfig = { ...DEFAULT_SWEEP_CONFIG, ...sweepConfig };
	}

	async searchGroups(params: SearchGroupsParams): Promise<GroupSummary[]> {
		const value = params.creditMax ?? params.creditMin;
		if (!value || value <= 0) {
			throw new Error("searchGroups exige creditMax/creditMin > 0 (valor do bem do passo 2).");
		}
		const segment = categoryToBeviSegment(params.category);
		const prefs = await this.session.getSimulationPrefs();
		// FIX-70: sweep opt-in (default off) — a busca simples mantém o < 3s da 1ª
		// impressão; o sweep enriquece o índice cumulativo com 3-5 faixas.
		// FIX-219: o valor-alvo SEMPRE varre com/sem lance embutido (offersForValue);
		// o sweep de faixa de valor mantém 1 variante por faixa (a de `prefs`).
		const offers = params.sweep
			? await this.sweepOffers(segment, value, prefs.embeddedPercentage)
			: await this.offersForValue(segment, value, prefs.embeddedPercentage);
		// Oferta aritmeticamente impossível não chega ao cliente (ver
		// `ofertaEhCoerente`): uma carta de R$ 190 mil com parcela que somava
		// R$ 168 mil no total foi apresentada e defendida na conversa.
		const coerentes = offers.filter((o) => {
			if (ofertaEhCoerente(o)) return true;
			console.error(
				JSON.stringify({
					level: "error",
					source: "bevi-offer-guard",
					event: "oferta_incoerente_descartada",
					quotaId: o.quotaId,
					carta: o.finalValue,
					parcela: o.importedInstallmentValue ?? o.installmentValue,
					prazo: o.term,
					totalPaid: o.totalPaid,
				}),
			);
			return false;
		});
		return coerentes.map(beviOfferToGroupSummary);
	}

	async simulateQuota(params: SimulateQuotaParams): Promise<QuotaSimulation> {
		const offer = this.offerIndex.get(params.groupId);
		// FIX-72: id fora do conjunto real → erro TIPADO (re-busca), nunca Error cru.
		if (!offer) throw new GroupNotInDiscoveryError(params.groupId);
		return beviOfferToQuotaSimulation(offer);
	}

	async getGroupDetails(params: GetGroupDetailsParams): Promise<GroupDetails> {
		const offer = this.offerIndex.get(params.groupId);
		// FIX-72: detalhar id fora do conjunto também sinaliza re-busca (era Error cru).
		if (!offer) throw new GroupNotInDiscoveryError(params.groupId);
		return {
			id: offer.quotaId,
			administradora: normalizeAdministradoraName(offer.bankLabel ?? offer.bank),
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
			const administradora = normalizeAdministradoraName(offer.bankLabel ?? offer.bank);
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

	/** Garante proposta criada + segmento gravado + simulação cacheada.
	 * FIX-219: `embeddedPercentage` é PARÂMETRO explícito (não mais derivado
	 * internamente de `session.getSimulationPrefs()`) — quem chama decide a
	 * variante (sem/com embutido); a cache key inclui o embutido pra não
	 * colidir entre variantes do mesmo (segmento, valor). */
	private async ensureOffers(
		segment: string,
		value: number,
		embeddedPercentage: "30" | "50" | undefined,
	): Promise<BeviOffer[]> {
		const key = `${segment}:${value}:${embeddedPercentage ?? "none"}`;
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
			embeddedPercentage,
			objective: prefs.objective,
		});

		this.offerCache.set(key, offers);
		for (const offer of offers) this.offerIndex.set(offer.quotaId, offer);
		return offers;
	}

	/** FIX-219 (Ata 2026-07-04, item 4) — a Bevi exige informar um valor de
	 * embutido pra simular e NÃO informa se a cota aceita; tratamos como DUAS
	 * queries pro mesmo valor: SEM embutido (baseline) e COM (~30%, de
	 * `getSimulationPrefs`). Une os resultados por quotaId (mesmo padrão do
	 * sweep de valor) e marca cada oferta com a variante que a produziu —
	 * `recommendation.ts` usa esse marcador pra não colapsar as duas
	 * modalidades do mesmo grupo no dedup.
	 *
	 * Defensivo: a variante SEM é a baseline — falha aqui é falha real de
	 * busca, propaga. A variante COM é o caso de borda da Ata ("se a cota não
	 * permitir, vende-se equivalente"): se falhar, degrada pro que já foi
	 * achado SEM embutido em vez de travar a busca inteira. */
	private async offersForValue(
		segment: string,
		value: number,
		embeddedCandidate: "30" | "50" | undefined,
	): Promise<BeviOffer[]> {
		const collected: BeviOffer[] = [];
		const seen = new Set<string>();
		const merge = (offers: BeviOffer[], variant: "sem" | "com") => {
			for (const offer of offers) {
				if (!seen.has(offer.quotaId)) {
					seen.add(offer.quotaId);
					collected.push({ ...offer, embeddedVariant: variant });
				}
			}
		};

		merge(await this.ensureOffers(segment, value, undefined), "sem");

		if (embeddedCandidate !== undefined) {
			if (this.sweepConfig.gapMs > 0) await sleep(this.sweepConfig.gapMs);
			try {
				merge(await this.ensureOffers(segment, value, embeddedCandidate), "com");
			} catch (err) {
				console.warn(
					JSON.stringify({
						level: "warn",
						source: "discovery-sweep",
						event: "embedded_variant_error",
						segment,
						value,
						embeddedCandidate,
						error_name: err instanceof Error ? err.name : "unknown",
					}),
				);
			}
		}

		return collected;
	}

	/** FIX-70 — sweep sequencial multi-faixa. Varre alvo + vizinhas (1 proposta
	 * ativa, re-PATCH sequencial — cookbook §3), acumula no offerIndex cumulativo
	 * e devolve a UNIÃO (alvo primeiro, dedup por quotaId). Reusa `ensureOffers`
	 * (cache-aware: faixa já buscada = lookup instantâneo).
	 *
	 * Defensivo:
	 * - A faixa-ALVO mantém o comportamento de hoje: erro propaga (descoberta real
	 *   falhou). A 1ª oferta é o que o usuário precisa.
	 * - Falha em VIZINHA aciona o circuit breaker: para o sweep e devolve o que já
	 *   acumulou (nunca relança). Throttle (429) é logado distintamente (calibra o
	 *   gap — o limite de rate não está no cookbook, o spike FIX-69 sonda).
	 * - Budget de tempo (`maxSweepMs`): não lança nova vizinha se estourar.
	 * - Faixa vazia (piso, §5a) não contribui ofertas, mas não para o sweep.
	 *
	 * FIX-219: o sweep de VALOR mantém 1 variante de embutido por faixa (a de
	 * `getSimulationPrefs`) — o eixo com/sem embutido roda só no valor-alvo via
	 * `offersForValue` (`searchGroups`). Dobrar as duas dimensões (valor ×
	 * embutido) multiplicaria as chamadas sequenciais sem pedido explícito da
	 * Ata, que descreve "a busca" (o valor-alvo) como as duas queries. */
	private async sweepOffers(
		segment: string,
		target: number,
		embeddedPercentage: "30" | "50" | undefined,
	): Promise<BeviOffer[]> {
		const { spread, floor, gapMs, maxSweepMs } = this.sweepConfig;
		const values = deriveSweepValues(target, { spread, floor });
		const collected: BeviOffer[] = [];
		const seen = new Set<string>();
		const startedAt = Date.now();

		for (let i = 0; i < values.length; i++) {
			const value = values[i];
			const isTarget = i === 0;

			if (!isTarget) {
				if (Date.now() - startedAt >= maxSweepMs) {
					console.warn(
						JSON.stringify({
							level: "warn",
							source: "discovery-sweep",
							event: "budget_exhausted",
							segment,
							target,
							swept: i,
							of: values.length,
						}),
					);
					break;
				}
				if (gapMs > 0) await sleep(gapMs);
			}

			try {
				const offers = await this.ensureOffers(segment, value, embeddedPercentage);
				for (const offer of offers) {
					if (!seen.has(offer.quotaId)) {
						seen.add(offer.quotaId);
						collected.push(offer);
					}
				}
			} catch (err) {
				// Faixa-alvo: erro real de descoberta → propaga (como hoje).
				if (isTarget) throw err;
				// Vizinha: circuit breaker — para o sweep, devolve o acumulado.
				const code = (err as { code?: number }).code ?? (err as { status?: number }).status;
				const throttled =
					code === 429 || /throttle|too many/i.test(err instanceof Error ? err.message : "");
				console.warn(
					JSON.stringify({
						level: "warn",
						source: "discovery-sweep",
						event: throttled ? "throttle_breaker" : "neighbor_error_breaker",
						segment,
						target,
						failed_value: value,
						error_name: err instanceof Error ? err.name : "unknown",
						code,
					}),
				);
				break;
			}
		}
		return collected;
	}
}

const round2 = (n: number) => Math.round(n * 100) / 100;
