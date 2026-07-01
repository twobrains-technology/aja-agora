// ProposalGateway — contrato de FECHAMENTO (Fulfillment) do consórcio.
//
// Separado do AdministradoraAdapter (Discovery, anônimo/grupo-cêntrico) porque a
// API de Parceiro Bevi/AGX é proposta-first e stateful: nada simula sem antes
// criar uma proposta (CPF + LGPD). A jornada do cliente (jornada.docx) só pede
// dado pessoal no passo 5 "Contratar" — é aqui que este gateway entra.
//
// Espelha os 7 endpoints da API de Parceiro (docs/integracoes/bevi-api-parceiro-spec.md)
// + uploadDocument (mecanismo do portal CONEXIA validado na POC,
// docs/integracoes/bevi-upload-poc.md).

import type { ConsorcioCategory } from "./types";

/** "valor_total" = `valor` é o crédito desejado; "valor_parcela" = `valor` é a
 * parcela-alvo. Ver spec §8. */
export type SimulationType = "valor_total" | "valor_parcela";

/** Eixo de persona da Bevi: contemplação rápida (sonhador) × investimento (investidor). */
export type ProposalObjetivo = "contemplacao_rapida" | "investimento";

/** Lance embutido como a API espera: "nenhum" ou o % como string ("25", "30", "50"). */
export type LanceEmbutido = "nenhum" | (string & {});

/** Segmento Bevi (6): AUTOS, IMOVEL, MOTOS, OUTROS BENS, PESADOS, SERVICOS. */
export interface BeviSegment {
	segmento: string;
	segmentoLabel: string;
}

/** Oferta REAL da API de Parceiro — exatamente 8 campos (spec §7). Bem mais pobre
 * que a oferta self-contract (68 campos) usada na Discovery. */
export interface PartnerOffer {
	ofertaId: string; // UUID, expira com a sessão (TTL 30min); usado no chooseOffer
	administradora: string; // ANCORA | BANCO DO BRASIL | CANOPUS | ITAU | RODOBENS | TRADICAO…
	tipoOferta: "SPECIAL_OFFER" | "FREE_BID";
	grupo: string;
	valorCarta: number; // R$
	/** R$. BUG-PARCELA-STRING (2026-06-12): a API nova devolve STRING pt-BR
	 * ("2.075,34"); o shape antigo era number. O mapper normaliza. */
	parcela: number | string;
	taxaContemplacao: number; // fração; SEMÂNTICA TBD — não exibir como taxa (spec §7)
	quotaId: string;
	/** Campos NOVOS da API 2026-06 (prazo em meses, lance médio R$) — opcionais
	 * porque o shape antigo não os tinha. Ainda não consumidos no produto. */
	prazo?: number;
	lanceMedio?: number;
}

export interface CreateProposalInput {
	cpf: string; // só dígitos
	celular: string; // só dígitos (DDD + número)
	termoLgpd: boolean; // aceite LGPD obrigatório
	consultaDados: boolean; // aceite de consulta obrigatório
	/** false (default) → 409 se o CPF já tem proposta ativa (devolve ongoingProposalIds). */
	ignoreOngoingProposals?: boolean;
}

export interface CreateProposalResult {
	proposalId: string;
}

export interface SimulateInput {
	proposalId: string;
	segmento: string;
	tipoSimulacao: SimulationType;
	valor: number;
	objetivo: ProposalObjetivo;
	lanceEmbutido?: LanceEmbutido; // default "nenhum"
	temLanceParaOfertar?: boolean; // default false
	valorDoLance?: number; // R$ do lance próprio (só quando temLanceParaOfertar)
}

export interface SimulationResult {
	simulationSessionId: string;
	expiresAt: string; // ISO — TTL ~30min; ofertaId só vale até aqui
	offers: PartnerOffer[];
}

export interface ChooseOfferInput {
	proposalId: string;
	ofertaId: string;
}

export interface ChooseOfferResult {
	proposalId: string;
	/** Link Bevi (uselink.me) que conclui a jornada do lado do cliente (assinatura). */
	consortiumProposalLink: string;
}

export interface DocumentLinks {
	proposalId: string;
	linkDocumentosPessoais: string; // uselink.me → portal CONEXIA
	linkComprovanteEndereco: string;
}

/** Qual documento anexar. O upload é por slot (frente/verso do RG/CNH, comprovante). */
export type DocumentSlot = "identidade_frente" | "identidade_verso" | "comprovante_endereco";

export interface UploadDocumentInput {
	proposalId: string;
	/** O link uselink.me devolvido por getDocumentLinks (dele extraímos o documentsToken). */
	documentsLink: string;
	slot: DocumentSlot;
	file: Uint8Array | Buffer;
	filename: string;
	mimeType: string; // image/jpeg | image/png | application/pdf
}

export interface InsertAdditionalDataInput {
	proposalId: string;
	documentoIdentidade: {
		tipoDocumento: "RG" | "CNH";
		numeroDaIdentidade: string;
		ufEmissor: string;
		dataEmissao: string; // YYYY-MM-DD
		orgaoEmissor: string;
	};
	endereco: {
		cep: string;
		estado: string;
		cidade: string;
		bairro: string;
		logradouro: string;
		numero: string;
	};
}

export interface ProposalStatusChange {
	title?: string;
	situation?: string;
	systemicValue?: string;
	sort?: number;
}

export interface ProposalStatus {
	proposalId: string;
	statusName: string;
	situation: string; // pending | …
	statusDescription: string | null;
	integrationCode: string | null;
	createdAt: string;
	updatedAt: string;
	approvedAt: string | null;
	reprovedAt: string | null;
	changesHistory: Array<{
		previousState?: ProposalStatusChange;
		newState?: ProposalStatusChange;
		[k: string]: unknown;
	}>;
}

/** Categoria de domínio (4) a partir do segmento Bevi (6). PESADOS→auto, OUTROS BENS→servicos. */
export type { ConsorcioCategory };

export interface FinalizeResult {
	proposalId: string;
	/** Nº gerado pela administradora — só o Trilho B (self-contract) tem esse
	 * passo explícito (inserção assíncrona via waitingForUniqueCode); pode vir
	 * undefined mesmo lá se a inserção ainda não resolveu (D11: nunca chutar). */
	proposalNumber?: number;
}

/** Contrato de fechamento. Implementado por BeviApiAdapter (real); testes injetam dublê (tests/helpers/mock-proposal-gateway). */
export interface ProposalGateway {
	createProposal(input: CreateProposalInput): Promise<CreateProposalResult>;
	listSegments(proposalId: string): Promise<BeviSegment[]>;
	simulate(input: SimulateInput): Promise<SimulationResult>;
	chooseOffer(input: ChooseOfferInput): Promise<ChooseOfferResult>;
	getDocumentLinks(proposalId: string): Promise<DocumentLinks>;
	/** Upload server-side via portal CONEXIA (POC). Lança se o mecanismo falhar — o
	 * chamador pode cair pro link (getDocumentLinks) como fallback. */
	uploadDocument(input: UploadDocumentInput): Promise<void>;
	insertAdditionalData(input: InsertAdditionalDataInput): Promise<void>;
	getStatus(proposalId: string): Promise<ProposalStatus>;
	/** Passo extra que só o Trilho B (self-contract) precisa: depois de
	 * `chooseOffer` (finished:true), finaliza a inserção na administradora
	 * (PATCH waitingForUniqueCode) e devolve o proposalNumber. OPCIONAL —
	 * o Trilho A não implementa (a inserção lá acontece do lado da Bevi após
	 * a assinatura via `consortiumProposalLink`, sem passo nosso). Chamadores
	 * usam `gateway.finalize?.(...)` (duck typing, sem checar o tipo concreto —
	 * ver docs/correcoes/decisions/2026-06-28-bloco-c-fechamento-trilho-b.md D3). */
	finalize?(proposalId: string): Promise<FinalizeResult>;
}
