"use client";

import { Check, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";

/** R5.7 — "Confirmar e contratar" responde ao DEDO, não ao servidor.
 *
 * O clique abre a contratação (a action `offer-confirm` volta pelo turno e o
 * servidor emite contrato/PDF) — e esse caminho leva segundos. Antes, o botão
 * ficava idêntico até o `useChat` virar "submitted", e quem clicou não tinha
 * nenhum sinal de que o pedido tinha entrado: clicava de novo.
 *
 * O estado é local e otimista de propósito: ele não diz "pronto", diz
 * "recebi e estou trabalhando". Se o envio falhar, o botão volta a aceitar o
 * clique — mentir "confirmado" numa contratação seria pior que pedir de novo.
 */
export function BotaoConfirmarContratar({ disabled = false }: { disabled?: boolean }) {
	const { sendAction } = useChatContext();
	const [confirmando, setConfirmando] = useState(false);

	const confirmar = useCallback(() => {
		if (disabled || confirmando) return;
		setConfirmando(true);
		void Promise.resolve(sendAction({ kind: "offer-confirm" }, "Confirmo essa carta")).catch(() =>
			setConfirmando(false),
		);
	}, [confirmando, disabled, sendAction]);

	return (
		<Button
			type="button"
			className="min-h-[44px] w-full gap-2 rounded-full"
			onClick={confirmar}
			disabled={disabled || confirmando}
			data-testid="offer-confirm"
			data-confirmando={confirmando ? "true" : undefined}
			aria-busy={confirmando}
		>
			{confirmando ? (
				<Loader2 className="size-4 animate-spin" aria-hidden="true" />
			) : (
				<Check className="size-4" aria-hidden="true" />
			)}
			{confirmando ? "Confirmando…" : "Confirmar e contratar"}
		</Button>
	);
}
