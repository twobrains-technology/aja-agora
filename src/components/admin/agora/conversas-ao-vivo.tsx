"use client";

import { GlobeIcon, HandIcon, HeadsetIcon, MessageCircleIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ConversaAoVivo, ESPERA_CRITICA_MIN } from "@/lib/admin/agora-types";
import { rotuloDoEstagio } from "@/lib/admin/lead-stages";

function tempoRelativo(minutos: number): string {
	if (minutos < 1) return "agora";
	if (minutos === 1) return "há 1 min";
	if (minutos < 60) return `há ${minutos} min`;
	const horas = Math.floor(minutos / 60);
	return horas === 1 ? "há 1 h" : `há ${horas} h`;
}

function trecho(texto: string | null, limite = 110): string {
	if (!texto) return "—";
	const limpo = texto.replace(/\s+/g, " ").trim();
	return limpo.length > limite ? `${limpo.slice(0, limite)}…` : limpo;
}

function Linha({ conversa }: { conversa: ConversaAoVivo }) {
	const critica = conversa.esperandoResposta && conversa.minutosParado >= ESPERA_CRITICA_MIN;
	const CanalIcon = conversa.canal === "whatsapp" ? MessageCircleIcon : GlobeIcon;

	return (
		<Link
			href={`/admin/conversations?conversation=${conversa.conversationId}`}
			className={`block rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
				critica ? "border-amber-500 border-2" : ""
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2 flex-wrap">
						<CanalIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<span className="sr-only">{conversa.canal === "whatsapp" ? "WhatsApp" : "Site"}</span>
						<span className="font-medium truncate">{conversa.nome ?? "Sem nome ainda"}</span>
						<Badge variant="outline" className="font-normal">
							{rotuloDoEstagio(conversa.stage)}
						</Badge>
						{conversa.emHandoff && (
							<Badge variant="secondary" className="font-normal gap-1">
								<HeadsetIcon className="size-3" aria-hidden="true" />
								Com atendente
							</Badge>
						)}
						{/* Estado nunca só por cor: ícone + palavra junto da borda destacada. */}
						{critica && (
							<Badge className="bg-amber-100 text-amber-900 border-amber-500 font-medium gap-1">
								<HandIcon className="size-3" aria-hidden="true" />
								Esperando há {conversa.minutosParado} min
							</Badge>
						)}
					</div>

					<p className="text-sm text-muted-foreground mt-1.5">
						<span className="font-medium">
							{conversa.ultimaMensagemDe === "user" ? "Cliente: " : "Agente: "}
						</span>
						{trecho(conversa.ultimaMensagem)}
					</p>

					<p className="text-xs text-muted-foreground mt-1">{conversa.origem.label}</p>
				</div>

				<span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
					{tempoRelativo(conversa.minutosParado)}
				</span>
			</div>
		</Link>
	);
}

export function ConversasAoVivo({ conversas }: { conversas: ConversaAoVivo[] }) {
	return (
		<Card className="shadow-sm">
			<CardHeader>
				<CardTitle>Conversas ao vivo</CardTitle>
			</CardHeader>
			<CardContent>
				{conversas.length === 0 ? (
					<div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
						Ninguém conversando na última hora
					</div>
				) : (
					<div className="space-y-2">
						{conversas.map((conversa) => (
							<Linha key={conversa.conversationId} conversa={conversa} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
