// BeviApiAdapter — integração REAL com a API de Parceiro Bevi/AGX (CreditHub).
// Trilho A: gateway RPC `POST /api/v1/credithub/services` roteado pelo header
// `service_id`. Implementa o ProposalGateway (fechamento). Ver
// docs/integracoes/bevi-api-parceiro-spec.md.
//
// O upload de documento NÃO está nesta API — vive no portal CONEXIA (indiky) e é
// feito pelo ConexiaDocsClient (POC em docs/integracoes/bevi-upload-poc.md), pra
// onde uploadDocument() delega.

import type {
	BeviSegment,
	ChooseOfferInput,
	ChooseOfferResult,
	CreateProposalInput,
	CreateProposalResult,
	DocumentLinks,
	InsertAdditionalDataInput,
	ProposalGateway,
	ProposalStatus,
	SimulateInput,
	SimulationResult,
	UploadDocumentInput,
} from "../proposal-gateway";
import { BeviConfigError, type BeviFieldError, toBeviError } from "./bevi-errors";
import { ConexiaDocsClient } from "./conexia-docs-client";

export interface BeviApiConfig {
	baseUrl: string;
	apiToken: string;
	productId: string;
}

/** Envelope invariante de toda resposta (sucesso e erro) — spec §1. */
interface BeviEnvelope<T = unknown> {
	status: string;
	code: number;
	success: boolean;
	message: string;
	data: T;
}

const NOT_AVAILABLE =
	"BeviApiAdapter exige BEVI_API_TOKEN (loja parceira liberada na AGX). " +
	"Não existe fallback fictício em runtime — em teste injete um gateway via " +
	"__setProposalGatewayForTests. Ver docs/integracoes/bevi-api-parceiro-spec.md.";

/** Lê a config do env. Lança se faltar token — proteção contra hit acidental em
 * produção do parceiro (criar proposta = dado real).
 *
 * BUG-BEVI-EMPTY-ENV (2026-06-04): compose injeta `${VAR:-}` = string vazia e
 * `??` não cobre "" — vazio/whitespace = ausente (mesma classe do Trilho B). */
export function loadBeviConfigFromEnv(): BeviApiConfig {
	const apiToken = (process.env.BEVI_API_TOKEN ?? "").trim();
	if (!apiToken) throw new BeviConfigError(NOT_AVAILABLE, 0);
	return {
		baseUrl:
			(process.env.BEVI_BASE_URL ?? "").trim() ||
			"https://api.uxvision.tech/api/v1/credithub/services",
		apiToken,
		productId: (process.env.BEVI_PRODUCT_ID ?? "").trim() || "6986245b3518ceb00e7844da",
	};
}

const TIMEOUT_MS = 15_000;
const SIM_RETRY = 4; // 404 transitório do step de simulação (spec §4.3)
const SIM_RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class BeviApiAdapter implements ProposalGateway {
	private readonly config: BeviApiConfig;
	private readonly docs: ConexiaDocsClient;

	constructor(config?: BeviApiConfig, docs?: ConexiaDocsClient) {
		this.config = config ?? loadBeviConfigFromEnv();
		this.docs = docs ?? new ConexiaDocsClient();
	}

	/** 1 chamada genérica: injeta auth + service_id, parseia o envelope, lança erro
	 * tipado quando success:false. `retryOn404` só pro calculate_simulation. */
	private async callService<T>(
		serviceId: string,
		opts: { method?: string; body?: unknown; qs?: string; retryOn404?: boolean } = {},
	): Promise<T> {
		const { method = "POST", body, qs = "", retryOn404 = false } = opts;
		const maxAttempts = retryOn404 ? SIM_RETRY : 1;

		let lastErr: unknown;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const res = await fetch(this.config.baseUrl + qs, {
				method,
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
					service_id: serviceId,
					...(body ? { "Content-Type": "application/json" } : {}),
				},
				body: body ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});

			const env = (await res.json()) as BeviEnvelope<T>;
			if (env.success) return env.data;

			// 404 transitório na simulação → retry curto (spec §4.3)
			if (retryOn404 && env.code === 404 && attempt < maxAttempts) {
				lastErr = toBeviError(env.code, env.message, env.data);
				await sleep(SIM_RETRY_DELAY_MS);
				continue;
			}
			throw toBeviError(env.code, env.message, env.data);
		}
		// esgotou retries de 404
		throw lastErr;
	}

	async createProposal(input: CreateProposalInput): Promise<CreateProposalResult> {
		// ⚠️ os 5 campos de negócio são UPPERCASE (herança da Auto-Contratação, spec §4.1)
		const data = await this.callService<{ proposalId: string }>("insert_proposal_bevi_consorcio", {
			body: {
				productId: this.config.productId,
				CPF: onlyDigits(input.cpf),
				CELULAR: onlyDigits(input.celular),
				TERMO_LGPD: input.termoLgpd,
				CONSULTA_DE_DADOS: input.consultaDados,
				ignoreOngoingProposals: input.ignoreOngoingProposals ?? false,
			},
		});
		return { proposalId: data.proposalId };
	}

	async listSegments(proposalId: string): Promise<BeviSegment[]> {
		const data = await this.callService<{ segmentos: BeviSegment[] }>(
			"list_segments_bevi_consorcio",
			{ method: "GET", qs: `/segments?proposalId=${encodeURIComponent(proposalId)}` },
		);
		return data.segmentos ?? [];
	}

	async simulate(input: SimulateInput): Promise<SimulationResult> {
		const data = await this.callService<SimulationResult>("calculate_simulation_bevi_consorcio", {
			retryOn404: true,
			body: {
				// FIX-79 REVERTIDO (2026-06-28): o FIX-79 (QA Kairo 2026-06-25) mandava
				// `productId` aqui pra tentar resolver o 400 "Proposta não pertence ao
				// Bevi Consórcio". O dossiê 2026-06-26 + re-validação ao vivo provaram que
				// o erro é EXTERNO (Bevi/AGX: o productId aceito pelo insert está
				// desvinculado do produto "Consórcio" na conta do token) e independe deste
				// campo — a doc oficial (collection + spec §4.3) NÃO tem productId no
				// simulate; mandá-lo só nos desalinha do contrato. O vínculo correto é
				// responsabilidade do insert_proposal + da conta do token. PENDENTE-KAIRO:
				// acionar Bevi/AGX (causa-raiz externa). Ver
				// docs/integracoes/2026-06-26-dossie-validacao-endpoints-bevi.md.
				propostaId: input.proposalId, // camelCase! "proposta", não "proposal"
				segmento: input.segmento,
				tipoSimulacao: input.tipoSimulacao,
				valor: input.valor,
				objetivo: input.objetivo,
				lanceEmbutido: input.lanceEmbutido ?? "nenhum",
				// BUG-TEM-EMBUTIDO (dev 2026-06-12): a Bevi exige o boolean
				// `temEmbutido` na contemplação rápida — sem ele, 400 "Simulação
				// inválida: temEmbutido é obrigatório" e o fechamento (passo 5)
				// morria. Derivado do próprio lanceEmbutido (% ≠ "nenhum").
				temEmbutido: (input.lanceEmbutido ?? "nenhum") !== "nenhum",
				temLanceParaOfertar: input.temLanceParaOfertar ?? false,
				...(input.temLanceParaOfertar && input.valorDoLance != null
					? { valorDoLance: input.valorDoLance }
					: {}),
			},
		});
		return {
			simulationSessionId: data.simulationSessionId,
			expiresAt: data.expiresAt,
			offers: data.offers ?? [],
		};
	}

	async chooseOffer(input: ChooseOfferInput): Promise<ChooseOfferResult> {
		const data = await this.callService<{ proposalId: string; consortiumProposalLink: string }>(
			"choose_offer_bevi_consorcio",
			{ body: { propostaId: input.proposalId, ofertaId: input.ofertaId } },
		);
		return {
			proposalId: data.proposalId,
			consortiumProposalLink: data.consortiumProposalLink,
		};
	}

	async getDocumentLinks(proposalId: string): Promise<DocumentLinks> {
		const data = await this.callService<DocumentLinks>("get_document_upload_links_bevi_consorcio", {
			body: { propostaId: proposalId },
		});
		return {
			proposalId: data.proposalId ?? proposalId,
			linkDocumentosPessoais: data.linkDocumentosPessoais,
			linkComprovanteEndereco: data.linkComprovanteEndereco,
		};
	}

	/** Upload server-side via portal CONEXIA (não é a API de Parceiro). Delega ao
	 * ConexiaDocsClient — que resolve o documentsToken do link e faz o PATCH. */
	async uploadDocument(input: UploadDocumentInput): Promise<void> {
		await this.docs.upload(input);
	}

	async insertAdditionalData(input: InsertAdditionalDataInput): Promise<void> {
		await this.callService<{ proposalId: string }>("insert_additional_data_bevi_consorcio", {
			body: {
				propostaId: input.proposalId,
				documentoIdentidade: input.documentoIdentidade,
				endereco: input.endereco,
			},
		});
	}

	async getStatus(proposalId: string): Promise<ProposalStatus> {
		const data = await this.callService<ProposalStatus>("consult_proposal_status_bevi_consorcio", {
			body: { propostaId: proposalId },
		});
		return { ...data, proposalId: data.proposalId ?? proposalId };
	}
}

function onlyDigits(s: string): string {
	return (s ?? "").replace(/\D/g, "");
}

export type { BeviFieldError };
