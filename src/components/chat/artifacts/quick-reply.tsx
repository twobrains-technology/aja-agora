"use client";

import { motion } from "motion/react";
import { useCallback, useState } from "react";
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
 * vetor de resposta duplicada e de resposta fora de contexto. */
export function QuickReply({
	payload,
	active = true,
}: {
	payload: QuickReplyPayload;
	active?: boolean;
}) {
	const { sendUserMessage, status } = useChatContext();
	const [submitted, setSubmitted] = useState(false);
	const isStreaming = status === "submitted" || status === "streaming";

	const onSelect = useCallback(
		async (label: string) => {
			if (submitted) return;
			setSubmitted(true);
			await sendUserMessage(label);
		},
		[sendUserMessage, submitted],
	);

	const options = Array.isArray(payload?.options) ? payload.options : [];
	if (submitted || !active || options.length === 0) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 320, damping: 28 }}
			className="flex flex-wrap gap-2"
		>
			{options.map((opt) => (
				<button
					key={opt.value || opt.label}
					type="button"
					onClick={() => onSelect(opt.label)}
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
		</motion.div>
	);
}
