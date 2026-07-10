"use client";

import { Flame } from "lucide-react";
import type { ScarcityPayload } from "@/lib/chat/types";

// FIX-230 (docs/02-cards-novos.md CARD 2): escassez comercial — número
// placebo 1-6, ESTÁVEL por grupo (coerceScarcityPayload/stableSlotFromId).
// Invariantes duros: NUNCA total de cotas nem razão N/total (não temos esse
// dado); a barra é DECORATIVA (largura fixa ~90%). Sem `availableSlots` →
// não renderiza (sem fallback/estimativa, D3 do ADR).
export function Scarcity({ payload }: { payload: ScarcityPayload }) {
	if (payload.availableSlots == null || !Number.isFinite(payload.availableSlots)) return null;

	return (
		<div className="w-full max-w-sm rounded-[14px] border border-warning/30 bg-[var(--aja-cream)] px-3.5 py-3 flex flex-col gap-2">
			<p className="flex items-center gap-1.5 text-sm font-semibold">
				<Flame className="size-4 shrink-0 text-warning" />
				Grupo quase cheio · restam apenas {payload.availableSlots}
			</p>
			<div className="h-1.5 rounded-full bg-warning/15 overflow-hidden">
				<div
					data-testid="scarcity-bar"
					className="h-full rounded-full bg-warning"
					style={{ width: "90%" }}
				/>
			</div>
			<p className="text-[11px] leading-snug text-muted-foreground">
				Quando preencher, entra fila para o próximo grupo.
			</p>
		</div>
	);
}
