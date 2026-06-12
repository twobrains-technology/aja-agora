// Apresentação do fechamento (passo 5 "Contratar" do docx) — módulo ÚNICO de
// copy/artifacts consumido pelo route (web) e pelo harness do eval. O docx exige
// literalmente os 2 reforços e o "Parabéns!" final; mantê-los aqui garante que
// teste e produção falam exatamente a mesma coisa (DRY de copy).

import type { ConfirmOfferResult, StartContractResult } from "./fulfillment";

export type ClosingItem =
	| { kind: "text"; text: string }
	| {
			kind: "artifact";
			type: "real_offer" | "signature_handoff" | "document_upload";
			payload: Record<string, unknown>;
	  };

/** Passo 5.1 — oferta REAL confirmada pela administradora, a confirmar pelo usuário. */
export function realOfferPresentation(result: StartContractResult): ClosingItem[] {
	if (result.noOffer || !result.offer) {
		return [
			{
				kind: "text",
				text: "Não encontrei uma carta pra esse valor agora — o mínimo varia por tipo de bem. Quer ajustar o valor?",
			},
		];
	}
	const offer = result.offer;
	return [
		{
			kind: "text",
			text: `Confirmei com a ${offer.administradora}. Essa é a sua carta real — confere e confirma pra eu seguir:`,
		},
		{
			kind: "artifact",
			type: "real_offer",
			payload: {
				proposalId: result.proposalId,
				administradora: offer.administradora,
				grupo: offer.grupo,
				category: offer.category,
				creditValue: offer.creditValue,
				monthlyPayment: offer.monthlyPayment,
				// FIX-39: prazo REAL só entra quando a API o devolveu (Number.isFinite);
				// ausente → chave omitida e o card mantém a copy de fallback (D11).
				...(Number.isFinite(offer.termMonths) ? { termMonths: offer.termMonths } : {}),
			},
		},
	];
}

/** Passo 5.2 — confirmação: reforços literais do docx → assinatura + documentos
 * → "Parabéns!". A ordem É a do docx (reforços antes, parabéns depois). */
export function closingPresentation(res: ConfirmOfferResult): ClosingItem[] {
	const administradora = res.administradora ?? "administradora";
	return [
		{
			kind: "text",
			text:
				`Perfeito! Você está contratando um consórcio da ${administradora}, ` +
				"escolhida pela Aja Agora para o seu perfil. " +
				"E a Aja Agora segue com você até a contemplação — e depois dela.",
		},
		{
			kind: "artifact",
			type: "signature_handoff",
			payload: {
				administradora: res.administradora ?? "",
				consortiumProposalLink: res.consortiumProposalLink,
			},
		},
		{
			kind: "artifact",
			type: "document_upload",
			payload: {
				proposalId: res.proposalId,
				documentsLinkPersonal: res.documentsLinkPersonal,
				optional: true,
			},
		},
		{
			kind: "text",
			text: "Parabéns! Agora você está oficialmente mais perto da sua conquista!",
		},
	];
}
