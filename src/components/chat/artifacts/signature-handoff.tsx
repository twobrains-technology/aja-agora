"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SignatureHandoffPayload } from "@/lib/chat/types";

// Encaminhamento pra assinatura digital da administradora — sem o cliente sentir
// que "trocou de empresa" (frase do doc). O link é o consortiumProposalLink Bevi.
export function SignatureHandoff({ payload }: { payload: SignatureHandoffPayload }) {
	return (
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-3 pt-4">
				<div className="flex items-center gap-2">
					<ShieldCheck className="size-4 text-primary" />
					<p className="text-sm font-medium">Sua contratação está pronta</p>
				</div>
				<p className="text-xs text-muted-foreground">
					Você está contratando um consórcio da {payload.administradora || "administradora"},
					escolhida pela Aja Agora pro seu perfil. A gente segue com você até a contemplação.
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
					Continuar para a assinatura
				</Button>
			</CardContent>
		</Card>
	);
}
