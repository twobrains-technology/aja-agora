// Apresentação do fechamento (passo 5 "Contratar" do docx) — módulo ÚNICO de
// copy/artifacts consumido pelo route (web) e pelo harness do eval. O docx exige
// literalmente os 2 reforços e o "Parabéns!" final; mantê-los aqui garante que
// teste e produção falam exatamente a mesma coisa (DRY de copy).

import type { ConfirmOfferResult, StartContractResult } from "./fulfillment";

export type ClosingItem =
	| { kind: "text"; text: string }
	| {
			kind: "artifact";
			type: "real_offer" | "signature_handoff" | "document_upload" | "atendimento_handoff";
			payload: Record<string, unknown>;
	  };

/** O WhatsApp OFICIAL da Aja Agora — o único canal por onde o atendente fala
 * com o cliente depois do fechamento. Fonte única: a copy do fecho, o card de
 * handoff e o contexto do modelo (converse.ts) leem daqui. */
export const WHATSAPP_OFICIAL_DIGITOS = "5511955020229";
export const WHATSAPP_OFICIAL_EXIBICAO = "+55 11 95502-0229";

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
	opts: {
		declaredLanceValue?: number;
		clientName?: string | null;
		/** A oferta que o cliente VIU e aprovou. A carta real da administradora
		 * pode voltar com outra parcela e outro prazo (o grupo disponível não é o
		 * mesmo que foi simulado) — e ele decidiu olhando os números antigos. Sem
		 * isso, dizia sim a 48 meses e assinava 55, sem uma palavra. */
		ofertaVista?: { monthlyPayment?: number; termMonths?: number } | null;
		/** O cliente aceitou lance embutido: a carta maior que o bem é intencional. */
		cartaMaiorPorEmbutido?: boolean;
	} = {},
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
				// Nome pro cabeçalho do documento (ProposalDoc). Só quando temos
				// o dado — nunca inventa (D11); ausente omite a linha "Cliente".
				...(opts.clientName?.trim() ? { clientName: opts.clientName.trim() } : {}),
				...(opts.cartaMaiorPorEmbutido ? { cartaMaiorPorEmbutido: true } : {}),
				// O que ele VIU antes de dizer sim — só quando DIVERGE do que a
				// administradora devolveu (sem divergência não há o que avisar).
				...(Number.isFinite(opts.ofertaVista?.monthlyPayment) &&
				Number.isFinite(offer.monthlyPayment) &&
				Math.round(opts.ofertaVista?.monthlyPayment as number) !==
					Math.round(offer.monthlyPayment as number)
					? { parcelaVista: opts.ofertaVista?.monthlyPayment }
					: {}),
				...(Number.isFinite(opts.ofertaVista?.termMonths) &&
				Number.isFinite(offer.termMonths) &&
				opts.ofertaVista?.termMonths !== offer.termMonths
					? { prazoVisto: opts.ofertaVista?.termMonths }
					: {}),
			},
		},
	];
	// FIX-40: só compara quando há AMBOS — lance declarado (>0) E lance médio do
	// grupo (fonte real). Sem um deles, silêncio (D11: nada de número sem fonte).
	const declared = opts.declaredLanceValue;
	if (Number.isFinite(declared) && (declared as number) > 0 && Number.isFinite(offer.avgBidValue)) {
		items.push({
			kind: "text",
			text: bidPositionText(declared as number, offer.avgBidValue as number),
		});
	}
	return items;
}

/** Passo 5.2 — confirmação: reforços literais → assinatura + documentos →
 * "Parabéns!". A ordem É a do docx (reforços antes, parabéns depois).
 *
 * FIX-278 (veredito r9, G2): terminologia RESERVA DE COTA (Ata 2026-07-04,
 * item 2/P0, SUPERSEDE o docx) — nunca "consórcio fechado/contratado".
 *
 * FIX-265 (menor #3, veredito Fable r5, N7): "acabei de te mandar uma
 * mensagenzinha no seu WhatsApp" era dito INCONDICIONALMENTE, mesmo quando o
 * envio (sendFechoPedirOi) só ENFILEIROU (janela fechada + template não
 * aprovado) — mentira observável em dev. `whatsappChannel` (resultado real de
 * `resolveAndSend`, já conhecido pelo caller ANTES de montar esta copy) decide
 * entre "mandei" (free_text/template — aconteceu agora) e "vou te mandar"
 * (queued — ainda não chegou). Sem opts, mantém o texto de sempre —
 * retrocompatível (default = canal web).
 *
 * FIX-344 (bloco-e-fallback-residual, rodada 2 — veredito Sonnet, P0): a
 * função nunca soube distinguir "vou mandar mensagem NOVA no WhatsApp" de "o
 * canal atual JÁ É o WhatsApp" — interactive-handlers.ts (fecho por clique
 * DENTRO do WhatsApp) chamava sem opts e herdava um beat que só faz sentido
 * pro canal WEB ("acabei de te mandar... responde por lá com um oi" — dito a
 * um cliente que já está exatamente nessa conversa). `channel: "whatsapp"`
 * remove os dois itens desse beat inteiro (a função técnica de abrir a janela
 * de 24h com uma mensagem NOVA não existe quando não há mensagem nova — o
 * cliente já respondeu o botão na janela aberta). O resto do fecho
 * (reserva/Parabéns/especialista chama em seguida) não depende de canal. */
export function closingPresentation(
	res: ConfirmOfferResult,
	opts: {
		channel?: "web" | "whatsapp";
		/** URL assinada da NOSSA proposta em PDF. Sem ela o card "Sua proposta está
		 * pronta" não sai — melhor não ter card do que mandar o cliente pro PDF da
		 * administradora em domínio de terceiro (abolido em 2026-07-21). */
		propostaUrl?: string | null;
	} = {},
): ClosingItem[] {
	const administradora = res.administradora ?? "administradora";
	// O handoff pro atendente humano: um BEAT só, com uma ação só. Na web vira
	// card com botão de WhatsApp (o cliente precisa de um lugar pra clicar, não
	// de um número no meio de um parágrafo); no WhatsApp é uma frase, porque a
	// conversa já está no canal certo.
	const handoffBeat: ClosingItem[] =
		opts.channel === "whatsapp"
			? [
					{
						kind: "text",
						text: `Em breve um atendente da Aja Agora te chama por aqui mesmo, neste número, pra fazer a adesão na ${administradora}. Ele cuida dos documentos e do cadastro — você não precisa enviar nada agora, é só ficar de olho.`,
					},
				]
			: [
					{
						kind: "artifact",
						type: "atendimento_handoff",
						payload: {
							numero: WHATSAPP_OFICIAL_DIGITOS,
							numeroFormatado: WHATSAPP_OFICIAL_EXIBICAO,
							administradora: res.administradora ?? "",
							mensagemInicial: `Oi! Acabei de fechar minha proposta${
								res.administradora ? ` da ${res.administradora}` : ""
							} pelo site da Aja Agora.`,
						},
					},
				];
	return [
		// Um beat só, sem repetir a mesma ideia. Antes eram dois textos + o card da
		// proposta, e "escolhida pela Aja Agora pro seu perfil" / "segue com você até
		// a contemplação" apareciam DUAS vezes no mesmo balão — costura de blocos,
		// não fala. "Booking" também saiu: o texto é em português.
		{
			kind: "text",
			text:
				`Perfeito! Sua cota da ${administradora} está reservada, escolhida pela Aja Agora ` +
				"para o seu perfil — e a Aja Agora segue com você até a contemplação, e depois dela. " +
				"Você não paga nada agora: a primeira parcela só vence quando o boleto chegar na sua casa.",
		},
		// A NOSSA proposta. Sem ela, nenhum card — nunca o link da administradora.
		...(opts.propostaUrl
			? [
					{
						kind: "artifact" as const,
						type: "signature_handoff" as const,
						payload: {
							administradora: res.administradora ?? "",
							proposalUrl: opts.propostaUrl,
						},
					},
				]
			: []),
		// O card de upload de RG/CNH SAIU do fecho (Kairo, 2026-07-21): quem pede
		// e recebe documento é o atendente que faz a adesão, na conversa dele. Pedir
		// documento aqui era mais uma tarefa jogada no cliente logo depois do
		// "Parabéns" — e ninguém do outro lado esperando por ela.
		{
			kind: "text",
			text: "Parabéns! Agora você está oficialmente mais perto da sua conquista!",
		},
		// O "oi" no WhatsApp tem função TÉCNICA (abre a janela de 24h,
		// whatsapp/window.ts) — sem ele, o envio do atendente cai na fila de
		// template. Por isso o handoff é um card com botão, não um número solto
		// no meio de um parágrafo.
		...handoffBeat,
	];
}
