// BeviSelfContractClient — Trilho B (self-contract) da Bevi/AGX.
// Rotas `/unauth/product-self-contract/...` — SEM token; a loja é identificada
// pelo `storeHash` (público, vem na URL do link da loja-piloto). É o trilho que
// devolve ofertas RICAS (~68 campos) e alimenta a DESCOBERTA real da jornada
// (passos 3-4 do docx). Fonte: docs/integracoes/bevi-api-requests.md (capturas
// reais de 2026-05-27).
//
// ⚠️ create-proposal exige CPF + celular + LGPD ANTES de simular — não existe
// simulação anônima. A coleta antecipada de identidade é decisão D1
// (docs/jornada/CONTEXT.md).
//
// ⚠️ Fingerprint de device: a app oficial usa FingerprintJS e o servidor retoma
// a proposta ativa por device; o transporte do fingerprint NÃO aparece nas
// capturas (mascarado). Server-side seguimos o que o cookbook documenta — o
// "Duplicated Hash" (proposta ativa) é tratado como retomada, não como fatal.
// Validação ao vivo pendente na homologação (pendência D3).

import { BeviConfigError, DuplicatedProposalError, toBeviError } from "./bevi-errors";
import type { BeviOffer } from "./offer-mapper";

export interface SelfContractConfig {
	baseUrl: string;
	storeHash: string;
}

const MISSING_HASH =
	"BeviSelfContractClient exige BEVI_SELFCONTRACT_HASH (hash público da loja). " +
	"Sem ele não há descoberta real — e dado mockado é PROIBIDO em runtime " +
	"(docs/jornada/CONTEXT.md). Ver docs/integracoes/bevi-api-requests.md.";

/** Lê a config do env. Lança sem o hash da loja — sem fallback silencioso. */
export function loadSelfContractConfigFromEnv(): SelfContractConfig {
	const storeHash = process.env.BEVI_SELFCONTRACT_HASH;
	if (!storeHash) throw new BeviConfigError(MISSING_HASH, 0);
	return {
		baseUrl:
			process.env.BEVI_SELFCONTRACT_BASE_URL ??
			"https://core-production-selfcontract-atsb7.ondigitalocean.app",
		storeHash,
	};
}

/** Envelope das rotas self-contract (mesmo shape do Trilho A). Exceção:
 * get-multi-proposal devolve um ARRAY cru, sem envelope (cookbook §2). */
interface SelfContractEnvelope<T = unknown> {
	status: string;
	code: number;
	success: boolean;
	message?: string;
	data: T;
}

export interface SelfContractProposalRef {
	proposalId: string;
	hashId: string;
	status: { name: string; systemicValue: string; situation: string };
	proposalNumber?: number;
	createdAt?: string;
	redirect?: boolean;
}

export interface CreateSelfContractProposalInput {
	cpf: string;
	celular: string;
	/** Aceite LGPD — default true (o card de identidade só envia após aceite). */
	lgpdAceite?: boolean;
	consultarDados?: boolean;
	ignoreOngoingProposals?: boolean;
}

export interface SelfContractSimulationInput {
	/** Default TOTAL_VALUE (simular pelo valor do bem). */
	simulationType?: "TOTAL_VALUE" | "INSTALLMENT_VALUE";
	simulationValue: number;
	/** Default FAST_APPROVAL (docx: objetivo derivado do prazo). */
	objective?: "FAST_APPROVAL" | "INVESTMENT";
	/** "30" | "50" — omitido quando o usuário NÃO opta por lance embutido. */
	embeddedPercentage?: "30" | "50";
}

const TIMEOUT_MS = 15_000;
const SIM_RETRY = 4; // 404 transitório do step de simulação (cookbook §5b)
const SIM_RETRY_DELAY_MS = 400;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

export class BeviSelfContractClient {
	private readonly config: SelfContractConfig;

	constructor(config?: SelfContractConfig) {
		this.config = config ?? loadSelfContractConfigFromEnv();
	}

	private url(path: string): string {
		return `${this.config.baseUrl}/unauth/product-self-contract/${path}`;
	}

	/** Chamada com envelope: parseia, lança erro tipado em success:false.
	 * `retryOn404` só pro step de simulação (estado ainda não materializado). */
	private async call<T>(
		path: string,
		opts: { method?: string; body?: unknown; retryOn404?: boolean } = {},
	): Promise<T> {
		const { method = "GET", body, retryOn404 = false } = opts;
		const maxAttempts = retryOn404 ? SIM_RETRY : 1;

		let lastErr: unknown;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const res = await fetch(this.url(path), {
				method,
				headers: body ? { "Content-Type": "application/json" } : {},
				body: body ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});

			const env = (await res.json()) as SelfContractEnvelope<T>;
			if (env.success) return env.data;

			if (retryOn404 && env.code === 404 && attempt < maxAttempts) {
				lastErr = toBeviError(env.code, env.message ?? "", env.data);
				await sleep(SIM_RETRY_DELAY_MS);
				continue;
			}
			if (env.code === 400 && /duplicated hash/i.test(env.message ?? "")) {
				throw new DuplicatedProposalError(env.message ?? "Duplicated Hash", env.data);
			}
			throw toBeviError(env.code, env.message ?? "", env.data);
		}
		throw lastErr;
	}

	/** GET /segment-resource — segmentos disponíveis na loja (cookbook §1). */
	async getSegments(): Promise<string[]> {
		const data = await this.call<{ segmentResource: string[] }>(
			`${this.config.storeHash}/segment-resource`,
		);
		return data.segmentResource ?? [];
	}

	/** GET /get-multi-proposal/{cpf} — propostas em andamento do CPF (cookbook §2).
	 * Resposta é um ARRAY cru (201), sem envelope. */
	async getMultiProposal(cpf: string): Promise<SelfContractProposalRef[]> {
		const res = await fetch(
			this.url(`${this.config.storeHash}/get-multi-proposal/${onlyDigits(cpf)}`),
			{
				method: "GET",
				signal: AbortSignal.timeout(TIMEOUT_MS),
			},
		);
		const data = (await res.json()) as SelfContractProposalRef[];
		return Array.isArray(data) ? data : [];
	}

	/** POST /create-proposal/{hash} — cria a proposta de descoberta (cookbook §3).
	 * 400 "Duplicated Hash" = já existe proposta ativa pro device → DuplicatedProposalError
	 * (o chamador retoma; os update-steps continuam na proposta ativa server-side). */
	async createProposal(input: CreateSelfContractProposalInput): Promise<unknown> {
		return this.call<unknown>(`create-proposal/${this.config.storeHash}`, {
			method: "POST",
			body: {
				cpf: onlyDigits(input.cpf),
				celular: onlyDigits(input.celular),
				lgpd: { aceite: input.lgpdAceite ?? true },
				consultarDados: input.consultarDados ?? true,
				ignoreOngoingProposals: input.ignoreOngoingProposals ?? true,
			},
		});
	}

	/** PATCH step oQueVocePretendeAdquirir — grava o segmento (cookbook §4). */
	async setSegment(productType: string): Promise<void> {
		await this.call<unknown>(`update-step/${this.config.storeHash}/step/oQueVocePretendeAdquirir`, {
			method: "PATCH",
			body: { productType },
		});
	}

	/** PATCH step simulation — o coração (cookbook §5). Devolve as ofertas REAIS
	 * (~68 campos) em data.data.offers; piso de crédito = 200 com offers vazio. */
	async simulate(input: SelfContractSimulationInput): Promise<BeviOffer[]> {
		const data = await this.call<{ data?: { offers?: BeviOffer[] } }>(
			`update-step/${this.config.storeHash}/step/simulation`,
			{
				method: "PATCH",
				retryOn404: true,
				body: {
					simulationType: input.simulationType ?? "TOTAL_VALUE",
					simulationValue: input.simulationValue,
					objective: input.objective ?? "FAST_APPROVAL",
					...(input.embeddedPercentage ? { embeddedPercentage: input.embeddedPercentage } : {}),
				},
			},
		);
		return data?.data?.offers ?? [];
	}
}
