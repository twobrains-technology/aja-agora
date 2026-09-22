"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useChatContext } from "@/lib/chat/provider";
import type { QuickReplyPayload } from "@/lib/chat/types";

/** Atalhos de resposta pra pergunta que o agente acabou de fazer.
 *
 * São ATALHOS DE TEXTO, não escolha estruturada: o rótulo vai como mensagem
 * normal, exatamente como se o cliente tivesse digitado (mesmo padrão dos chips
 * de `desire`, gate-quick-reply.tsx). Isso é o que mantém a regra de ouro de pé
 * — cota, escolha e contrato continuam exigindo o clique no card da oferta, que
 * é quem carrega o `groupId`. Um botão daqui nunca compromete dinheiro.
 *
 * Some depois de clicado (`submitted`) e no histórico (`active=false`), pelo
 * mesmo motivo do FIX-48/49: atalho de uma pergunta velha, ainda clicável, é
 * vetor de resposta duplicada e de resposta fora de contexto.
 *
 * O CONSUMO É PERSISTIDO (L4). O estado local morria no reload: a página voltava
 * com o botão vivo e o cliente clicava o mesmo atalho duas vezes — o segundo
 * clique era reprocessado como resposta nova e o agente respondia seco
 * ("você já viu o formulário aqui em cima"). O `replyId` é gerado pelo SERVIDOR
 * na emissão e viaja no payload do artifact (`converse.ts`), então é o mesmo
 * antes e depois do reload; por ele o clique reivindica o consumo
 * (`/api/chat/quick-reply`, chave `click:<conversationId>:<replyId>` sobre a
 * primitiva `claimOnce`) e o render esconde o atalho já usado. */
export function QuickReply({
	payload,
	active = true,
}: {
	payload: QuickReplyPayload;
	active?: boolean;
}) {
	const { sendAction, sendUserMessage, status, conversationId } = useChatContext();
	const [submitted, setSubmitted] = useState(false);
	/** Atalhos já usados, lidos do servidor — o botão não volta no reload. */
	const [consumed, setConsumed] = useState<Set<string>>(() => new Set());
	/** O cliente clicou de novo num atalho já usado. Não é recusa: ele não achou
	 * o próximo passo, então a tela aponta onde ele está em vez de sumir. */
	const [jaUsado, setJaUsado] = useState(false);
	const isStreaming = status === "submitted" || status === "streaming";

	const options = Array.isArray(payload?.options) ? payload.options : [];
	const replyIds = options
		.map((o) => o.replyId)
		.filter((id): id is string => typeof id === "string" && id.length > 0);
	const chaveDeConsumo = replyIds.join(",");

	useEffect(() => {
		if (!active || !conversationId || chaveDeConsumo.length === 0) return;
		let alive = true;
		const params = new URLSearchParams({ conversationId, replyIds: chaveDeConsumo });
		fetch(`/api/chat/quick-reply?${params}`)
			.then((res) => (res.ok ? res.json() : { consumed: [] }))
			.then((data: { consumed?: unknown }) => {
				if (!alive) return;
				const ids = Array.isArray(data?.consumed)
					? data.consumed.filter((i): i is string => typeof i === "string")
					: [];
				setConsumed(new Set(ids));
			})
			.catch(() => {
				// Fail-open: sem a leitura, o atalho comporta como sempre se comportou.
			});
		return () => {
			alive = false;
		};
	}, [active, conversationId, chaveDeConsumo]);

	const onSelect = useCallback(
		async (opt: QuickReplyPayload["options"][number]) => {
			if (submitted) return;
			// O consumo vem ANTES do envio: quem perder a corrida não dispara um
			// turno repetido.
			if (opt.replyId && conversationId) {
				const claimed = await fetch("/api/chat/quick-reply", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ conversationId, replyId: opt.replyId }),
				})
					.then((res) => (res.ok ? res.json() : { claimed: true }))
					.then((data: { claimed?: unknown }) => data?.claimed !== false)
					.catch(() => true); // fail-open: erro de rede não trava o cliente
				if (!claimed) {
					setJaUsado(true);
					return;
				}
			}
			setSubmitted(true);
			// D6 — O ATALHO QUE ESCOLHE COTA É CLIQUE, NÃO FRASE.
			//
			// `groupId` aqui NUNCA vem do modelo: o servidor resolve o rótulo contra
			// as cotas REAIS já exibidas e só então o anexa (`coerceEscolhaNosAtalhos`).
			// Com ele, o caminho é o mesmo do botão do card — `choose_offer`, que
			// ancora a cota e libera o fechamento. Sem ele, texto puro como sempre.
			//
			// A cliente da conversa de 19/08 respondeu "a de prazo mais curto" à
			// pergunta do próprio agente e o funil ficou parado três portões atrás,
			// porque a resposta chegava como texto e texto não ancora escolha.
			if (opt.groupId) {
				await sendAction(
					{ kind: "choose_offer", groupId: opt.groupId, label: opt.label },
					opt.label,
				);
				return;
			}
			await sendUserMessage(opt.label);
		},
		[sendAction, sendUserMessage, submitted, conversationId],
	);

	const visiveis = options.filter((o) => !(o.replyId && consumed.has(o.replyId)));
	if (submitted || !active || (visiveis.length === 0 && !jaUsado)) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 320, damping: 28 }}
			className="flex flex-col gap-2"
		>
			{visiveis.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{visiveis.map((opt) => (
						<button
							key={opt.value || opt.label}
							type="button"
							onClick={() => onSelect(opt)}
							disabled={isStreaming}
							// Mesmo desenho dos chips de gate: pill de borda fina sobre o fundo do
							// chat. Dois formatos diferentes de atalho na mesma tela leriam como
							// dois produtos.
							className="inline-flex items-center gap-[7px] h-[30px] px-[12px] border border-[rgb(5_36_64/.4)] rounded-full bg-transparent text-xs font-semibold text-[var(--aja-ink)] cursor-pointer transition-colors hover:bg-[var(--aja-sand)] disabled:cursor-default disabled:opacity-50"
						>
							{opt.emoji && <span className="text-sm leading-none">{opt.emoji}</span>}
							{opt.label}
						</button>
					))}
				</div>
			)}
			{jaUsado && (
				// Clique repetido não é recusa: o cliente clicou de novo porque não
				// achou o próximo passo. A tela aponta para ele em vez de responder seco.
				<p className="text-xs text-muted-foreground">
					Você já respondeu por aqui — o próximo passo está logo acima ☝️
				</p>
			)}
		</motion.div>
	);
}
