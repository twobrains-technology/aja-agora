"use client";

import { BadgeCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useChatContext } from "@/lib/chat/provider";
import type { RealOfferPayload } from "@/lib/chat/types";

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Oferta REAL confirmada pela administradora (re-simulação Bevi). O usuário confirma
// antes do choose_offer — fecha o gap indicativo×real da Descoberta.
export function RealOffer({ payload }: { payload: RealOfferPayload }) {
	const { sendAction, sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	return (
		<Card className="w-full max-w-sm border-primary/40">
			<CardContent className="space-y-3 pt-4">
				<div className="flex items-center gap-2">
					<BadgeCheck className="size-4 text-primary" />
					<p className="text-sm font-medium">Confirmado com a {payload.administradora}</p>
				</div>

				<div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
					<Row label="Carta de crédito" value={brl(payload.creditValue)} strong />
					<Row label="Parcela" value={brl2(payload.monthlyPayment)} />
					<Row label="Grupo" value={payload.grupo} />
					<Row label="Administradora" value={payload.administradora} />
				</div>

				<div className="flex flex-col gap-2">
					<Button
						type="button"
						className="w-full min-h-[44px] gap-2"
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
						className="w-full"
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
			<span className={strong ? "font-semibold" : ""}>{value}</span>
		</div>
	);
}
