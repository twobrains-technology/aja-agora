"use client";

import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { EmbeddedBidPayload } from "@/lib/chat/types";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	}).format(value);

// Card curto (FIX-228, docs/02-cards-novos.md CARD 1): explica o conceito de
// lance embutido ANTES da agulha. Regra dura — não é opcional — o card SEMPRE
// diz que o crédito recebido diminui; a frase está hardcoded na copy (não
// interpolada do `payload.disclaimer`) pra sobreviver mesmo que o servidor
// mande outra coisa.
export function EmbeddedBid({ payload }: { payload: EmbeddedBidPayload }) {
	return (
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-3 pt-4">
				<p className="text-sm font-semibold leading-snug">
					Lance embutido — sem tirar do bolso
				</p>
				<p className="text-sm leading-snug text-muted-foreground">
					Você usa parte da própria carta como lance e antecipa a contemplação, sem
					desembolsar. O embutido sai da carta, então o crédito recebido diminui um pouco.
				</p>

				<div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
					<div>
						<p className="text-xs text-muted-foreground m-0">Lance embutido</p>
						<b className="aja-num text-sm font-semibold">{formatBRL(payload.embeddedBidValue)}</b>
					</div>
					<div>
						<p className="text-xs text-muted-foreground m-0">Valor que você recebe</p>
						<b className="aja-num text-sm font-semibold">{formatBRL(payload.netCredit)}</b>
					</div>
				</div>

				<p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
					<Info className="mt-0.5 size-3 shrink-0 text-primary" />
					Usar o lance embutido significa que o crédito recebido diminui (estimativa, não
					garantia).
				</p>
			</CardContent>
		</Card>
	);
}
