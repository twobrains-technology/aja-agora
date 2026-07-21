"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SignatureHandoffPayload } from "@/lib/chat/types";

// A proposta que este card abre é a NOSSA (PDF co-branded, `lib/proposal/`), não
// mais o PDF da administradora hospedado em domínio de terceiro — o cliente
// clicava em "Ver minha proposta" e caía num useme.link, saindo da Aja Agora pra
// ver o próprio plano (abolido pelo Kairo em 2026-07-21). A assinatura/efetivação
// é etapa posterior, feita pelo atendente; aqui é só a proposta pronta.
export function SignatureHandoff({ payload }: { payload: SignatureHandoffPayload }) {
	return (
		<div className="w-full max-w-sm rounded-[12px] border border-border bg-card p-[18px] shadow-lg flex flex-col gap-[14px]">
			{/* header */}
			<div className="flex items-center gap-2 text-primary">
				<ShieldCheck className="size-[17px]" />
				<p className="text-sm font-semibold text-foreground">Sua proposta está pronta</p>
			</div>

			<p className="text-xs text-muted-foreground leading-relaxed">
				O documento com a carta, a parcela e o prazo que combinamos com a{" "}
				{payload.administradora || "administradora"} — é seu, pode guardar.
			</p>

			<Button
				type="button"
				className="w-full h-[46px] min-h-[44px] gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:brightness-105"
				data-testid="signature-link"
				onClick={() => window.open(payload.proposalUrl, "_blank", "noopener,noreferrer")}
			>
				<ExternalLink className="size-4" />
				Ver minha proposta
			</Button>
		</div>
	);
}
