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

const fmtBRL = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** FIX-40: posição FACTUAL do lance declarado vs o lance médio do grupo. Rótulo
 * literal do campo, sem prometer contemplação (proibido derivar "chance" — a
 * semântica do lanceMedio não foi confirmada com a AGX). Só compara, nunca promete. */
function bidPositionText(declaredLance: number, avgBid: number): string {
	if (declaredLance > avgBid) {
		return `Sobre o seu lance: ${fmtBRL(declaredLance)} fica acima do lance médio desse grupo (${fmtBRL(avgBid)}).`;
	}
	if (declaredLance < avgBid) {
		return `Sobre o seu lance: ${fmtBRL(declaredLance)} fica abaixo do lance médio desse grupo (${fmtBRL(avgBid)}).`;
	}
	return `Sobre o seu lance: ${fmtBRL(declaredLance)} está na média do lance desse grupo (${fmtBRL(avgBid)}).`;
}

/** Passo 5.1 — oferta REAL confirmada pela administradora, a confirmar pelo usuário.
 * `declaredLanceValue` (lance da qualificação) habilita a frase de posição do FIX-40. */
export function realOfferPresentation(
	result: StartContractResult,
	opts: { declaredLanceValue?: number } = {},
): ClosingItem[] {
	if (result.noOffer || !result.offer) {
		return [
			{
				kind: "text",
				text: "Não encontrei uma carta pra esse valor agora — o mínimo varia por tipo de bem. Quer ajustar o valor?",
			},
		];
	}
	const offer = result.offer;
	// FIX-259 (P1, veredito Fable r4): quando o fechamento trocou a
	// administradora confirmada (catálogo sem ela na faixa), NUNCA silencia —
	// avisa explicitamente as duas marcas ANTES do card, em vez do "Confirmei
	// com a X" que sugeria confirmação lisa da marca esperada.
	const introText =
		result.administradoraChanged && result.previousAdministradora
			? `A ${result.previousAdministradora} não tem grupo disponível nessa faixa agora — a opção equivalente é a ${offer.administradora}${
					Number.isFinite(offer.monthlyPayment)
						? `, com parcela de ${fmtBRL(offer.monthlyPayment as number)}`
						: ""
				}. Essa é a carta real — confere e decide se quer seguir:`
			: `Confirmei com a ${offer.administradora}. Essa é a sua carta real — confere e confirma pra eu seguir:`;
	const items: ClosingItem[] = [
		{
			kind: "text",
			text: introText,
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
				// FIX-40: lance médio do grupo só com fonte (rótulo literal no card).
				...(Number.isFinite(offer.avgBidValue) ? { avgBidValue: offer.avgBidValue } : {}),
				// FIX-240 (CDC art. 30): a carta fechada pode divergir do valor pedido
				// (clamp de pickClosestOffer cobre a maioria, mas nem sempre há opção
				// mais próxima). rawCreditValue = valor pedido aciona o aviso de ajuste
				// (FIX-197, real-offer.tsx) — NUNCA confirma silenciosamente fora da faixa.
				...(Number.isFinite(result.requestedCreditValue) &&
				Math.round(result.requestedCreditValue as number) !== Math.round(offer.creditValue)
					? { rawCreditValue: result.requestedCreditValue }
					: {}),
			},
		},
	];
	// FIX-40: só compara quando há AMBOS — lance declarado (>0) E lance médio do
	// grupo (fonte real). Sem um deles, silêncio (D11: nada de número sem fonte).
	const declared = opts.declaredLanceValue;
	if (
		Number.isFinite(declared) &&
		(declared as number) > 0 &&
		Number.isFinite(offer.avgBidValue)
	) {
		items.push({
			kind: "text",
			text: bidPositionText(declared as number, offer.avgBidValue as number),
		});
	}
	return items;
}

/** Passo 5.2 — confirmação: reforços literais do docx → assinatura + documentos
 * → "Parabéns!". A ordem É a do docx (reforços antes, parabéns depois).
 *
 * FIX-265 (menor #3, veredito Fable r5, N7): "acabei de te mandar uma
 * mensagenzinha no seu WhatsApp" era dito INCONDICIONALMENTE, mesmo quando o
 * envio (sendFechoPedirOi) só ENFILEIROU (janela fechada + template não
 * aprovado) — mentira observável em dev. `whatsappChannel` (resultado real de
 * `resolveAndSend`, já conhecido pelo caller ANTES de montar esta copy) decide
 * entre "mandei" (free_text/template — aconteceu agora) e "vou te mandar"
 * (queued — ainda não chegou). Sem opts (callers que não migraram, ex.
 * interactive-handlers.ts), mantém o texto de sempre — retrocompatível. */
export function closingPresentation(
	res: ConfirmOfferResult,
	opts: { whatsappChannel?: "free_text" | "template" | "queued" } = {},
): ClosingItem[] {
	const administradora = res.administradora ?? "administradora";
	const pedirOiText =
		opts.whatsappChannel === "queued"
			? "Pra gente seguir, olha só: assim que a janela abrir, eu te mando uma mensagenzinha no seu WhatsApp."
			: "Pra gente seguir, olha só: acabei de te mandar uma mensagenzinha no seu WhatsApp.";
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
		// FIX-235 (handoff agente-vendas-consorcio, 2026-07-09 — D8): fecho pro
		// WhatsApp. NUNCA "reservado/garantido/você já está no grupo" — a proposta
		// foi enviada, mas nada foi contratado só com isso. O "oi" tem função
		// TÉCNICA (abre a janela de 24h do WhatsApp, whatsapp/window.ts) — sem ele,
		// o envio da especialista cai na fila de template.
		{
			kind: "text",
			text: pedirOiText,
		},
		{
			kind: "text",
			text: 'Me responde por lá com um "oi"? É só pra você já salvar o nosso contato.',
		},
		{
			kind: "text",
			text: "Daí, em alguns minutos, a nossa especialista em cadastros te chama pra pedir seus dados e os documentos pra dar entrada na administradora.",
		},
	];
}
