"use client";

import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";
import type { AjaUIMessage, ArtifactPartData } from "@/lib/chat/ui-message";

/** R5.7 — "Confirmar e contratar" responde ao DEDO, não ao servidor.
 *
 * O clique abre a contratação (a action `offer-confirm` volta pelo turno e o
 * servidor emite contrato/PDF) — e esse caminho leva segundos. Antes, o botão
 * ficava idêntico até o `useChat` virar "submitted", e quem clicou não tinha
 * nenhum sinal de que o pedido tinha entrado: clicava de novo.
 *
 * O estado é local e otimista de propósito: ele não diz "pronto", diz
 * "recebi e estou trabalhando". Mas o otimismo vale para O TURNO, não para a
 * promessa: o servidor responde erro de negócio como texto normal (o
 * "Pode tentar confirmar de novo?" de `api/chat/route.ts`), então a promessa
 * RESOLVE sem ter fechado nada — e travar o botão até uma rejeição deixava o
 * cliente sem saída (auditoria 310e, P144/P292). Quando o turno acaba sem o
 * fecho ter acontecido, o botão volta a aceitar o clique; se o contrato fechou,
 * ele fica concluído e não dispara uma segunda proposta.
 */

// Os cards que só existem DEPOIS de `confirmOffer` dar certo — o fecho de
// `lib/bevi/closing-presentation.ts`. O sinal é o que o cliente vê na tela, não
// o "ok" da rede. `signature_handoff` é a proposta em PDF; `atendimento_handoff`
// é o fecho sem PDF (o preparo da proposta é best-effort e pode falhar sem
// desfazer a contratação).
const CARDS_DO_FECHO = new Set<string>(["signature_handoff", "atendimento_handoff"]);

function fechouContrato(noClique: AjaUIMessage[], agora: AjaUIMessage[]): boolean {
	return agora
		.slice(noClique.length)
		.some((mensagem) =>
			mensagem.parts.some(
				(part) =>
					part.type === "data-artifact" &&
					CARDS_DO_FECHO.has((part.data as ArtifactPartData | undefined)?.type ?? ""),
			),
		);
}

export function BotaoConfirmarContratar({ disabled = false }: { disabled?: boolean }) {
	const { sendAction, status, messages } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [confirmando, setConfirmando] = useState(false);
	const [concluido, setConcluido] = useState(false);
	// Fotografia da conversa no clique e se o turno chegou a ir para o servidor:
	// a reconciliação só olha o que veio DEPOIS do clique, e só vale se houve
	// turno de verdade (sem stream, nada foi respondido).
	const mensagensNoClique = useRef<AjaUIMessage[] | null>(null);
	const turnoEmCurso = useRef(false);

	useEffect(() => {
		if (!confirmando) return;
		if (isStreaming) {
			turnoEmCurso.current = true;
			return;
		}
		// O turno ainda não começou neste commit (o `submitted` chega depois do
		// estado otimista): não há o que reconciliar.
		if (!turnoEmCurso.current) return;

		const noClique = mensagensNoClique.current;
		setConcluido(noClique !== null && fechouContrato(noClique, messages));
		setConfirmando(false);
		turnoEmCurso.current = false;
		mensagensNoClique.current = null;
	}, [confirmando, isStreaming, messages]);

	const confirmar = useCallback(() => {
		if (disabled || confirmando || concluido || isStreaming) return;
		mensagensNoClique.current = messages;
		turnoEmCurso.current = false;
		setConfirmando(true);
		void Promise.resolve(sendAction({ kind: "offer-confirm" }, "Confirmo essa carta")).catch(() => {
			// O envio nem saiu (sem rede): nenhum turno, nada fechou, nada a reconciliar.
			turnoEmCurso.current = false;
			mensagensNoClique.current = null;
			setConfirmando(false);
		});
	}, [confirmando, concluido, disabled, isStreaming, messages, sendAction]);

	return (
		<Button
			type="button"
			className="min-h-[44px] w-full gap-2 rounded-full"
			onClick={confirmar}
			disabled={disabled || confirmando || concluido}
			data-testid="offer-confirm"
			data-confirmando={confirmando ? "true" : undefined}
			data-concluido={concluido ? "true" : undefined}
			aria-busy={confirmando}
		>
			{confirmando ? (
				<Loader2 className="size-4 animate-spin" aria-hidden="true" />
			) : (
				<Check className="size-4" aria-hidden="true" />
			)}
			{concluido ? "Proposta confirmada" : confirmando ? "Confirmando…" : "Confirmar e contratar"}
		</Button>
	);
}
