// BeviSelfContractProposalGateway — integração REAL com o Trilho B (self-contract)
// como GATEWAY DE FECHAMENTO. Implementa o mesmo ProposalGateway que o
// BeviApiAdapter (Trilho A), mas por baixo fala com o BeviSelfContractClient
// (`/unauth/...`, sem token, sem productId — 1 proposta ativa por storeHash).
//
// Design completo: docs/correcoes/decisions/2026-06-28-bloco-c-fechamento-trilho-b.md
//
// Pontos-chave (não óbvios pra quem só leu o ProposalGateway):
// - O self-contract NÃO devolve um proposalId de verdade no create-proposal
//   (só o hash da loja). O proposalId REAL só existe via GET /system
//   (data.proposal._id) — D1.
// - "Escolher oferta" não é um endpoint separado: reenvia os MESMOS parâmetros
//   da simulação + `finished:true` + o objeto da oferta escolhida. Por isso
//   este gateway CACHEIA as ofertas cruas da última simulate() (por quotaId)
//   e os parâmetros da simulação — D5.
// - `consortiumProposalLink` vem sempre "" (self-contract fecha inline, sem
//   redirect uselink.me) — D2. O dado real (proposalNumber) só existe via
//   `finalize()` (opcional na interface) — D3.
// - `getDocumentLinks`/`uploadDocument` não têm mecanismo comprovado ao vivo
//   (PENDENTE-KAIRO) — delegam a um STUB do contrato do bloco-a (FIX-84,
//   `dispatchClientDocument`) até o merge de A substituir por import real.

import type {
	BeviSegment,
	ChooseOfferInput,
	ChooseOfferResult,
	CreateProposalInput,
	CreateProposalResult,
	DocumentLinks,
	FinalizeResult,
	InsertAdditionalDataInput,
	PartnerOffer,
	ProposalGateway,
	ProposalStatus,
	SimulateInput,
	SimulationResult,
	UploadDocumentInput,
} from "../proposal-gateway";
import { DuplicatedProposalError } from "./bevi-errors";
import type { BeviOffer } from "./offer-mapper";
import type { BeviSelfContractClient, SelfContractSimulationInput } from "./self-contract-client";

// ── STUB local — contrato REAL: dispatchClientDocument(documentId, target)
// em src/lib/documents/dispatch.ts (bloco-a, FIX-84 — onda paralela, ainda não
// mergeada). TODO(bloco-a): trocar esta função por
// `import { dispatchClientDocument } from "@/lib/documents/dispatch"` assim
// que o bloco-a mergear. Comportamento do stub espelha o que o bloco-a já
// documentou pro alvo "bevi_b": marca `pending` sem enviar (upload self-contract
// ao vivo é PENDENTE-KAIRO) — nunca perde o documento, nunca lança. ──
export type DispatchTarget = "bevi_a" | "bevi_b" | "mesa";
export interface DispatchResult {
	documentId: string;
	target: DispatchTarget;
	status: "sent" | "failed" | "pending" | "manual";
}
export async function dispatchClientDocument(
	documentId: string,
	target: DispatchTarget,
): Promise<DispatchResult> {
	return { documentId, target, status: "pending" };
}

/** BeviOffer real traz ~72 campos; o offer-mapper.ts só declara os que a
 * DESCOBERTA consome. Aqui precisamos de mais alguns pro mapeamento de
 * fechamento (PartnerOffer) — ver tabela D5 na decisão. */
interface BeviOfferExt extends BeviOffer {
	type?: "SPECIAL_OFFER" | "FREE_BID" | "EMBEDDED_BID";
	lowestContemplationRate?: number;
	averageBid?: number;
	validityEnd?: string;
}

const DEFAULT_TTL_MS = 30 * 60_000;

/** D5 — BeviOffer (self-contract) → PartnerOffer (shape que pickClosestOffer/
 * partnerOfferToRealOffer, em fulfillment.ts, já esperam — não modificados). */
function toPartnerOffer(offer: BeviOfferExt): PartnerOffer {
	return {
		ofertaId: offer.quotaId,
		administradora: offer.bankLabel ?? offer.bank,
		// EMBEDDED_BID colapsa em SPECIAL_OFFER — GAP documentado (D5), mesmo
		// padrão de colapso de enum que offer-mapper.ts já usa (adjustmentType).
		tipoOferta: offer.type === "FREE_BID" ? "FREE_BID" : "SPECIAL_OFFER",
		grupo: offer.group,
		valorCarta: offer.finalValue,
		parcela: offer.importedInstallmentValue ?? offer.installmentValue ?? 0,
		taxaContemplacao: offer.lowestContemplationRate ?? 0,
		quotaId: offer.quotaId,
		prazo: offer.term,
		lanceMedio: offer.averageBid,
	};
}

function deriveExpiresAt(offers: BeviOfferExt[]): string {
	const fromOffer = offers[0]?.validityEnd;
	if (typeof fromOffer === "string" && fromOffer) return fromOffer;
	return new Date(Date.now() + DEFAULT_TTL_MS).toISOString();
}

const SIM_TYPE_MAP: Record<SimulateInput["tipoSimulacao"], "TOTAL_VALUE" | "INSTALLMENT_VALUE"> = {
	valor_total: "TOTAL_VALUE",
	valor_parcela: "INSTALLMENT_VALUE",
};
const OBJETIVO_MAP: Record<SimulateInput["objetivo"], "FAST_APPROVAL" | "INVESTMENT"> = {
	contemplacao_rapida: "FAST_APPROVAL",
	investimento: "INVESTMENT",
};

/** Self-contract só aceita "30"|"50" de embutido (enum fechado); o Trilho A é
 * string aberta. Fora desses dois valores, cai no teto mais próximo (30) —
 * nunca lança, o embutido é um refinamento opcional da simulação. */
function toEmbeddedPercentage(
	lanceEmbutido: SimulateInput["lanceEmbutido"],
): "30" | "50" | undefined {
	if (!lanceEmbutido || lanceEmbutido === "nenhum") return undefined;
	return lanceEmbutido === "50" ? "50" : "30";
}

function toSelfContractSimulationInput(input: SimulateInput): SelfContractSimulationInput {
	return {
		simulationType: SIM_TYPE_MAP[input.tipoSimulacao] ?? "TOTAL_VALUE",
		simulationValue: input.valor,
		objective: OBJETIVO_MAP[input.objetivo] ?? "FAST_APPROVAL",
		embeddedPercentage: toEmbeddedPercentage(input.lanceEmbutido),
	};
}

export class BeviSelfContractProposalGateway implements ProposalGateway {
	private proposalId: string | null = null;
	private lastSimParams: SelfContractSimulationInput | null = null;
	private readonly offerIndex = new Map<string, BeviOfferExt>();

	constructor(private readonly client: BeviSelfContractClient) {}

	/** Cria (ou RETOMA — reuso automático, D3) a proposta. O self-contract é
	 * stateful por hash: se já existe uma ativa (Duplicated Hash), é a MESMA
	 * proposta que a descoberta criou — não criamos outra, só resolvemos o
	 * proposalId real dela via /system. */
	async createProposal(input: CreateProposalInput): Promise<CreateProposalResult> {
		try {
			await this.client.createProposal({
				cpf: input.cpf,
				celular: input.celular,
				lgpdAceite: input.termoLgpd,
				consultarDados: input.consultaDados,
				ignoreOngoingProposals: input.ignoreOngoingProposals ?? true,
			});
		} catch (err) {
			if (!(err instanceof DuplicatedProposalError)) throw err;
			// proposta ativa pro hash — retomada (mesmo tratamento que
			// BeviSelfContractAdapter.ensureOffers já faz na descoberta).
		}
		const state = await this.client.getSystemState();
		this.proposalId = state.proposalId;
		return { proposalId: state.proposalId };
	}

	async listSegments(_proposalId: string): Promise<BeviSegment[]> {
		const segs = await this.client.getSegments();
		return segs.map((s) => ({ segmento: s, segmentoLabel: s }));
	}

	async simulate(input: SimulateInput): Promise<SimulationResult> {
		await this.client.setSegment(input.segmento);
		const simParams = toSelfContractSimulationInput(input);
		this.lastSimParams = simParams;

		const rawOffers = (await this.client.simulate(simParams)) as BeviOfferExt[];
		this.offerIndex.clear();
		for (const offer of rawOffers) this.offerIndex.set(offer.quotaId, offer);

		return {
			// self-contract não tem um id de sessão de simulação distinto —
			// reusa o proposalId como placeholder estável (documentado, D1).
			simulationSessionId: this.proposalId ?? "selfcontract-session",
			expiresAt: deriveExpiresAt(rawOffers),
			offers: rawOffers.map(toPartnerOffer),
		};
	}

	/** "Escolher" no self-contract = finished:true no MESMO step de simulação,
	 * reenviando os params da última simulate() + o objeto da oferta cacheada
	 * (não há endpoint separado — bevi-api-discovery.md §4). */
	async chooseOffer(input: ChooseOfferInput): Promise<ChooseOfferResult> {
		const offer = this.offerIndex.get(input.ofertaId);
		if (!offer) {
			throw new Error(
				`Oferta "${input.ofertaId}" não encontrada na última simulação self-contract — ` +
					"não simulada ou expirada; re-simule antes de escolher.",
			);
		}
		if (!this.lastSimParams) {
			throw new Error("chooseOffer chamado sem simulate() prévio — nada pra reenviar.");
		}
		await this.client.chooseOffer({ ...this.lastSimParams, offer });
		// D2: sentinel vazio — self-contract fecha inline, sem uselink.me.
		return { proposalId: input.proposalId, consortiumProposalLink: "" };
	}

	/** D2 — self-contract não produz links uselink.me (fecha inline). */
	async getDocumentLinks(proposalId: string): Promise<DocumentLinks> {
		return { proposalId, linkDocumentosPessoais: "", linkComprovanteEndereco: "" };
	}

	/** Upload server-side do self-contract NÃO tem mecanismo comprovado ao vivo
	 * (PENDENTE-KAIRO — portal CONEXIA redireciona via documentsToken na app
	 * oficial). Delega ao despacho desacoplado do bloco-a (STUB até o merge). */
	async uploadDocument(input: UploadDocumentInput): Promise<void> {
		const documentId = `${input.proposalId}:${input.slot}:${input.filename}`;
		await dispatchClientDocument(documentId, "bevi_b");
	}

	async insertAdditionalData(input: InsertAdditionalDataInput): Promise<void> {
		await this.client.setIdentityDoc({
			rg: input.documentoIdentidade.numeroDaIdentidade,
			orgaoEmissor: input.documentoIdentidade.orgaoEmissor,
			ufEmissor: input.documentoIdentidade.ufEmissor,
			dataEmissao: input.documentoIdentidade.dataEmissao,
		});
		await this.client.setEndereco({
			cep: input.endereco.cep,
			estado: input.endereco.estado,
			cidade: input.endereco.cidade,
			bairro: input.endereco.bairro,
			logradouro: input.endereco.logradouro,
			numero: input.endereco.numero,
		});
	}

	/** Self-contract é stateful por HASH, não por proposalId — não há endpoint
	 * de status por id. O argumento é ignorado de propósito; lemos sempre o
	 * estado corrente do hash (a única proposta ativa). */
	async getStatus(proposalId: string): Promise<ProposalStatus> {
		const state = await this.client.getSystemState();
		const iso = new Date().toISOString();
		return {
			proposalId: state.proposalId || proposalId,
			statusName: state.currentStepSlug,
			situation: state.situation,
			statusDescription: null,
			integrationCode: null,
			createdAt: iso,
			updatedAt: iso,
			approvedAt: null,
			reprovedAt: null,
			changesHistory: [],
		};
	}

	/** Passo extra que só o Trilho B tem: inserção assíncrona na administradora
	 * (waitingForUniqueCode). proposalNumber pode vir undefined (async — D11,
	 * nunca chutado). */
	async finalize(proposalId: string): Promise<FinalizeResult> {
		const result = await this.client.finalize();
		return { proposalId, proposalNumber: result.proposalNumber };
	}
}
