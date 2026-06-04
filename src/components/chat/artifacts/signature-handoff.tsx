"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SignatureHandoffPayload } from "@/lib/chat/types";

// DESVIO-ASSINATURA (docs/jornada/CONTEXT.md, DES-1): o jornada.docx assume
// "assinatura digital no fechamento", mas o `consortiumProposalLink` da API de
// Parceiro é o PDF da PROPOSTA de consórcio (não um portal de assinatura). A
// assinatura/efetivação é etapa posterior da mesa. O card apresenta a proposta
// pronta + a continuidade da Aja Agora — sem o cliente sentir que mudou de empresa.
export function SignatureHandoff({ payload }: { payload: SignatureHandoffPayload }) {
	return (
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-3 pt-4">
				<div className="flex items-center gap-2">
					<ShieldCheck className="size-4 text-primary" />
					<p className="text-sm font-medium">Sua proposta está pronta</p>
				</div>
				<p className="text-xs text-muted-foreground">
					Sua proposta de consórcio da {payload.administradora || "administradora"}, escolhida pela
					Aja Agora pro seu perfil, já está gerada. A gente segue com você daqui pra frente, até a
					contemplação.
				</p>
				<Button
					type="button"
					className="w-full min-h-[44px] gap-2"
					data-testid="signature-link"
					onClick={() =>
						window.open(payload.consortiumProposalLink, "_blank", "noopener,noreferrer")
					}
				>
					<ExternalLink className="size-4" />
					Ver minha proposta
				</Button>
			</CardContent>
		</Card>
	);
}
