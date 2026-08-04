"use client";

import {
	CheckCircle2Icon,
	EyeIcon,
	HandIcon,
	HeadsetIcon,
	MessagesSquareIcon,
	TimerIcon,
	UserPlusIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PulsoAgora } from "@/lib/admin/agora-types";

interface CartaoProps {
	titulo: string;
	valor: number;
	rodape: string;
	icone: React.ComponentType<{ className?: string }>;
	/** Marca o cartão como "precisa de gente AGORA" — nunca só por cor. */
	acionavel?: boolean;
}

function Cartao({ titulo, valor, rodape, icone: Icone, acionavel }: CartaoProps) {
	// Sinal duplo de propósito: cor + ícone + a palavra "Precisa de gente". Cor
	// sozinha exclui quem não a distingue, e este é o cartão que manda agir.
	const destaque = acionavel && valor > 0;

	return (
		<Card className={destaque ? "shadow-sm border-amber-500 border-2" : "shadow-sm"}>
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
				<Icone className={`size-4 ${destaque ? "text-amber-600" : "text-primary"}`} />
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-bold tracking-tight tabular-nums">{valor}</div>
				<p className="text-xs text-muted-foreground mt-1.5">
					{destaque ? (
						<span className="text-amber-700 font-medium inline-flex items-center gap-1">
							<HandIcon className="size-3" aria-hidden="true" />
							Precisa de gente
						</span>
					) : (
						rodape
					)}
				</p>
			</CardContent>
		</Card>
	);
}

export function PulsoCards({ pulso }: { pulso: PulsoAgora }) {
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
			<Cartao
				titulo="Visitas na última hora"
				valor={pulso.visitasUltimaHora}
				rodape="Chegadas ao site e por anúncio"
				icone={EyeIcon}
			/>
			<Cartao
				titulo="Conversas ao vivo"
				valor={pulso.conversasAoVivo}
				rodape="Com mensagem na última hora"
				icone={MessagesSquareIcon}
			/>
			<Cartao
				titulo="Esperando resposta"
				valor={pulso.esperandoResposta}
				rodape="Ninguém está esperando"
				icone={TimerIcon}
				acionavel
			/>
			<Cartao
				titulo="Sem dono na mesa"
				valor={pulso.semDonoNaMesa}
				rodape={`${pulso.emAtendimentoNaMesa} em atendimento`}
				icone={HeadsetIcon}
				acionavel
			/>
			<Cartao
				titulo="Leads hoje"
				valor={pulso.leadsHoje}
				rodape="Desde a meia-noite (Brasília)"
				icone={UserPlusIcon}
			/>
			<Cartao
				titulo="Fechados hoje"
				valor={pulso.fechadosHoje}
				rodape="Contratos do dia"
				icone={CheckCircle2Icon}
			/>
		</div>
	);
}
