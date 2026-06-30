// Erros tipados da API de Parceiro Bevi/AGX. O envelope de resposta é sempre
// { status, code, success, message, data }; em erro, data costuma trazer
// data.errors[] ou data.ongoingProposalIds[]. Ver spec §10.

export interface BeviFieldError {
	field: string;
	message: string;
}

/** Erro base: 1 parser de envelope lança isto quando success:false. */
export class BeviApiError extends Error {
	readonly code: number;
	readonly errors: BeviFieldError[];
	readonly data: unknown;

	constructor(code: number, message: string, errors: BeviFieldError[] = [], data: unknown = null) {
		super(message);
		this.name = "BeviApiError";
		this.code = code;
		this.errors = errors;
		this.data = data;
	}
}

/** 409 — CPF já tem proposta ativa. O produto usa `ongoingProposalIds` pro fluxo
 * "retomar vs nova proposta". */
export class OngoingProposalError extends BeviApiError {
	readonly ongoingProposalIds: string[];
	constructor(message: string, ongoingProposalIds: string[], data: unknown = null) {
		super(409, message, [], data);
		this.name = "OngoingProposalError";
		this.ongoingProposalIds = ongoingProposalIds;
	}
}

/** 400 — valor abaixo do mínimo do segmento (R$ 15.000 no piloto). */
export class MinCreditError extends BeviApiError {
	readonly minCredit: number;
	constructor(
		message: string,
		minCredit: number,
		errors: BeviFieldError[] = [],
		data: unknown = null,
	) {
		super(400, message, errors, data);
		this.name = "MinCreditError";
		this.minCredit = minCredit;
	}
}

/** 400 "Duplicated Hash" do self-contract (Trilho B) — já existe proposta ativa
 * pro device/loja. NÃO é fatal: a app retoma a proposta ativa server-side
 * (cookbook bevi-api-requests.md §3). */
export class DuplicatedProposalError extends BeviApiError {
	constructor(message: string, data: unknown = null) {
		super(400, message, [], data);
		this.name = "DuplicatedProposalError";
	}
}

/** 400 "Proposta não pertence ao Bevi Consórcio." — a proposta foi criada sob um
 * `productId`/conta que o token não reconhece como "Bevi Consórcio" no `simulate`
 * (FIX-79). NÃO é transitório: nasce de `BEVI_PRODUCT_ID` errado na criação e NUNCA
 * cura no retry — a correção é setar o `productId` correto no env (PENDENTE-KAIRO,
 * dado externo da Bevi/AGX). Tipado pra ops greparem a classe exata e o teste
 * asseverar; o route já degrada gracioso no catch genérico. */
export class ProposalOwnershipError extends BeviApiError {
	constructor(message: string, errors: BeviFieldError[] = [], data: unknown = null) {
		super(400, message, errors, data);
		this.name = "ProposalOwnershipError";
	}
}

/** ofertaId expirado (TTL 30min) — re-simular antes do chooseOffer. */
export class OfferExpiredError extends BeviApiError {
	constructor(message = "Oferta expirada — re-simule antes de escolher.", data: unknown = null) {
		super(410, message, [], data);
		this.name = "OfferExpiredError";
	}
}

/** 403 / falta de token — erro de config/credencial. NÃO mostrar ao usuário; alertar ops. */
export class BeviConfigError extends Error {
	readonly code: number;
	constructor(message: string, code = 403) {
		super(message);
		this.name = "BeviConfigError";
		this.code = code;
	}
}

/** Mapeia o envelope de erro pra erro tipado de domínio (spec §10). */
export function toBeviError(
	code: number,
	message: string,
	data: unknown,
): BeviApiError | BeviConfigError {
	const d = (data ?? {}) as {
		errors?: BeviFieldError[];
		ongoingProposalIds?: string[];
	};
	const errors = d.errors ?? [];

	if (code === 403) return new BeviConfigError(message, 403);
	if (code === 409 && Array.isArray(d.ongoingProposalIds)) {
		return new OngoingProposalError(message, d.ongoingProposalIds, data);
	}
	if (code === 400) {
		const valorErr = errors.find((e) => e.field === "valor");
		if (valorErr) {
			// extrai o mínimo da mensagem "…(R$ 15.000,00)" quando presente
			const m = valorErr.message.match(/R\$\s*([\d.]+)/);
			const min = m ? Number(m[1].replace(/\./g, "")) : 15000;
			return new MinCreditError(valorErr.message, min, errors, data);
		}
		// FIX-79: ownership da proposta ("não pertence ao Bevi Consórcio") — product
		// mismatch na criação. Tipado pra diagnóstico (PENDENTE-KAIRO: BEVI_PRODUCT_ID).
		if (errors.some((e) => e.field === "propostaId")) {
			return new ProposalOwnershipError(message, errors, data);
		}
	}
	return new BeviApiError(code, message, errors, data);
}
