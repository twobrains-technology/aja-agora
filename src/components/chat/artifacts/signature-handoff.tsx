"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SignatureHandoffPayload } from "@/lib/chat/types";

// DESVIO-ASSINATURA (docs/jornada/CONTEXT.md, DES-1): o jornada.docx assume
// "assinatura digital no fechamento", mas o `consortiumProposalLink` da API de
// Parceiro é o PDF da PROPOSTA de consórcio (não um portal de assinatura). A
// assinatura/efetivação é etapa posterior da mesa. O card apresenta a proposta
// pronta + a continuidade da Aja Agora — sem o cliente sentir que mudou de empresa.
export function SignatureHandoff({ payload }: { payload: SignatureHandoffPayload }) {
	return (
		<div className="w-full max-w-sm rounded-[18px] border border-border bg-card p-[18px] shadow-lg flex flex-col gap-[14px]">
			{/* header */}
			<div className="flex items-center gap-2 text-primary">
				<ShieldCheck className="size-[17px]" />
				<p className="text-sm font-semibold text-foreground">Sua proposta está pronta</p>
			</div>

			<p className="text-xs text-muted-foreground leading-relaxed">
				Sua proposta de consórcio da {payload.administradora || "administradora"}, escolhida pela
				Aja Agora pro seu perfil, já está gerada. A gente segue com você daqui pra frente, até a
				contemplação.
			</p>

			<Button
				type="button"
				className="w-full h-[46px] min-h-[44px] gap-2 rounded-[13px] bg-primary text-sm font-semibold text-primary-foreground shadow-[0_6px_16px_-6px_rgba(3,110,255,0.5)] hover:brightness-105"
				data-testid="signature-link"
				onClick={() => window.open(payload.consortiumProposalLink, "_blank", "noopener,noreferrer")}
			>
				<ExternalLink className="size-4" />
				Ver minha proposta
			</Button>
		</div>
	);
}
