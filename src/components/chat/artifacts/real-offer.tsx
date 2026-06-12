"use client";

import { BadgeCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useChatContext } from "@/lib/chat/provider";
import type { RealOfferPayload } from "@/lib/chat/types";

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Oferta REAL confirmada pela administradora (re-simulação Bevi). O usuário confirma
// antes do choose_offer — fecha o gap indicativo×real da Descoberta.
export function RealOffer({ payload }: { payload: RealOfferPayload }) {
	const { sendAction, sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	return (
		<Card className="w-full max-w-[340px] rounded-[18px] shadow-lg border-[#bcd3ff]">
			<CardContent className="space-y-3 pt-4 px-4 pb-4">
				{/* Selo de confirmação */}
				<div className="flex items-center gap-2 text-primary">
					<BadgeCheck className="size-[18px] shrink-0" />
					<p className="text-sm font-semibold">Confirmado com a {payload.administradora}</p>
				</div>

				{/* Bloco de dados (stored). BUG-PARCELA-STRING (2026-06-12): payload
				    pode chegar com número null/ausente (a Bevi mudou o shape da API)
				    — o card NUNCA morre por isso: omite a linha (D11: nenhum número
				    inventado) e mantém os CTAs vivos. */}
				<div className="rounded-xl bg-muted/40 p-3 space-y-2">
					{Number.isFinite(payload.creditValue) && (
						<Row label="Valor do bem" value={brl(payload.creditValue)} strong />
					)}
					{Number.isFinite(payload.monthlyPayment) && (
						<Row label="Parcela" value={brl2(payload.monthlyPayment as number)} />
					)}
					{/* FIX-39: prazo REAL da API nova (defensivo — nunca NaN/derivado). */}
					{Number.isFinite(payload.termMonths) && (
						<Row label="Prazo" value={`${payload.termMonths} meses`} />
					)}
					<Row label="Grupo" value={payload.grupo} />
					{/* FIX-40: lance médio do grupo — rótulo LITERAL do campo da Bevi.
					    Só com fonte; NUNCA promete contemplação (regra D11). */}
					{Number.isFinite(payload.avgBidValue) && (
						<Row label="Lance médio do grupo" value={brl(payload.avgBidValue as number)} />
					)}
					<Row label="Administradora" value={payload.administradora} />
				</div>

				{/* FIX-13/FIX-39: com prazo da API, a copy fala só das DEMAIS condições;
				    sem prazo (shape antigo / API volta atrás), mantém o fallback honesto
				    do FIX-13 (D11: nenhum número sem fonte — explicar, nunca derivar). */}
				<p className="text-[11px] text-muted-foreground leading-snug">
					{Number.isFinite(payload.termMonths)
						? "Demais condições: na sua proposta (PDF), logo após a confirmação."
						: "Prazo e demais condições: na sua proposta (PDF), logo após a confirmação."}
				</p>

				{/* CTAs */}
				<div className="flex flex-col gap-2 pt-0.5">
					<Button
						type="button"
						className="w-full min-h-[44px] rounded-[13px] gap-2 shadow-[var(--shadow-primary)]"
						onClick={() =>
							!isStreaming && void sendAction({ kind: "offer-confirm" }, "Confirmo essa carta")
						}
						disabled={isStreaming}
						data-testid="offer-confirm"
					>
						<Check className="size-4" />
						Confirmar e contratar
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="w-full rounded-[13px] min-h-[44px]"
						onClick={() => !isStreaming && void sendUserMessage("Quero ver outras opções")}
						disabled={isStreaming}
						data-testid="offer-reject"
					>
						Ver outras opções
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className={`aja-num text-sm${strong ? " font-bold" : " font-medium"}`}>{value}</span>
		</div>
	);
}
