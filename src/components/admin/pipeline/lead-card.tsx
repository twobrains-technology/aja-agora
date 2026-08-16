"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import {
	ArrowRight,
	Clock,
	DollarSign,
	Globe,
	Headset,
	MessageSquare,
	Smartphone,
	XCircle,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { rotuloDoEstagio } from "@/lib/admin/lead-stages";
import { destinosDeAvanco, podeMarcarPerdido } from "./avanco-de-etapa";

// Responsável da mesa por um lead (spec 2026-07-03). Shape client-safe do
// ActiveHandoffSummary do servidor (@/lib/mesa/handoff) — sem puxar o DB pro bundle.
export interface LeadActiveHandoff {
	id: string;
	status: "aberto" | "em_andamento";
	attendant: { id: string; nome: string; whatsapp: string } | null;
	since: string;
}

export interface Lead {
	id: string;
	conversationId: string;
	contactId?: string | null;
	name: string | null;
	phone: string | null;
	email: string | null;
	stage: string;
	creditValue: string | null;
	createdAt: string;
	updatedAt: string;
	// FIX-45: canais usados pelo contato (dedup). Vazio → cai no canal da conversa.
	channels?: string[];
	// Responsável da mesa (handoff ativo), quando houver. null = sem transbordo ativo.
	activeHandoff?: LeadActiveHandoff | null;
	conversation: {
		channel: "web" | "whatsapp";
		createdAt: string;
		updatedAt: string;
	};
	/**
	 * De onde este lead chegou — a campanha, não o canal.
	 *
	 * `null` quando a conversa não nasceu de uma visita medida (WhatsApp
	 * orgânico, importação). Isso é diferente de "direto", que afirma uma
	 * chegada pela landing sem campanha.
	 */
	origem?: {
		tipo: "campanha" | "click-to-whatsapp" | "referencia" | "direto";
		fonte: string | null;
		campanha: string | null;
		criativo: string | null;
		label: string;
	} | null;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function getDisplayName(lead: Lead): string {
	if (lead.name) return lead.name;
	if (lead.phone) return lead.phone;
	return "Lead sem nome";
}

function ChannelIcon({ channel }: { channel: "web" | "whatsapp" }) {
	if (channel === "whatsapp") {
		return <Smartphone className="size-3.5 text-green-600" />;
	}
	return <Globe className="size-3.5 text-blue-600" />;
}

export function LeadCard({
	lead,
	isDragging,
	onLeadClick,
	raiasVisiveis,
	onAvancar,
}: {
	lead: Lead;
	isDragging: boolean;
	onLeadClick?: (leadId: string) => void;
	/** Raias que esta pessoa enxerga (vêm do servidor) — base do botão de avanço. */
	raiasVisiveis?: readonly string[];
	onAvancar?: (leadId: string, destino: string) => void;
}) {
	// Só a PRÓXIMA etapa vira botão. Oferecer todas de uma vez polui o card, e
	// pular etapa continua possível arrastando — aqui é o caminho previsível.
	const proximaEtapa = raiasVisiveis ? destinosDeAvanco(raiasVisiveis, lead.stage)[0] : undefined;
	const podePerder = raiasVisiveis ? podeMarcarPerdido(raiasVisiveis, lead.stage) : false;
	const wasDragging = useRef(false);
	useEffect(() => {
		wasDragging.current = isDragging;
	}, [isDragging]);
	const timeInStage = formatDistanceToNow(new Date(lead.updatedAt), {
		addSuffix: true,
		locale: ptBR,
	});

	const lastInteraction = formatDistanceToNow(new Date(lead.conversation.updatedAt), {
		addSuffix: true,
		locale: ptBR,
	});

	// Sem valor, a linha inteira sai do card. Antes ela ficava com um travessão
	// solto ao lado do cifrão — ocupava altura, puxava o olho e não dizia nada.
	const creditDisplay = lead.creditValue
		? currencyFormatter.format(Number(lead.creditValue))
		: null;

	return (
		<Card
			size="sm"
			className={`cursor-pointer transition-all hover:shadow-md ${isDragging ? "opacity-50 rotate-2 shadow-lg" : "shadow-sm"}`}
			onClick={() => {
				if (wasDragging.current) return;
				onLeadClick?.(lead.id);
			}}
		>
			<CardContent className="space-y-2.5">
				<div className="flex items-center justify-between gap-2">
					<span className="font-medium truncate text-sm">{getDisplayName(lead)}</span>
					{/* FIX-45: badge multi-canal (dedup por contato). Fallback pro canal
					    da conversa quando o card não veio deduplicado. */}
					<div className="flex shrink-0 items-center gap-1" data-testid="lead-channels">
						{(lead.channels && lead.channels.length > 0
							? lead.channels
							: [lead.conversation.channel]
						).map((ch) => (
							<Badge key={ch} variant="secondary" className="text-[10px] px-1.5 h-5">
								<ChannelIcon channel={ch as "web" | "whatsapp"} />
								<span className="ml-0.5">{ch === "whatsapp" ? "WA" : "Web"}</span>
							</Badge>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
					{creditDisplay && (
						<div className="flex items-center gap-1.5">
							<DollarSign className="size-3 text-emerald-600 dark:text-emerald-400" />
							<span className="text-foreground font-medium">{creditDisplay}</span>
						</div>
					)}
					{/* Dois relógios lado a lado diziam "há 28 dias" e "há 28 dias" — só o
					    ícone distinguia um do outro. O rótulo (tooltip + leitor de tela)
					    resolve sem gastar a largura do card. */}
					<div className="flex items-center gap-1.5" title="Tempo nesta etapa">
						<Clock className="size-3" aria-hidden />
						<span className="sr-only">Nesta etapa:</span>
						<span>{timeInStage}</span>
					</div>
					<div className="flex items-center gap-1.5" title="Última mensagem na conversa">
						<MessageSquare className="size-3" aria-hidden />
						<span className="sr-only">Última mensagem:</span>
						<span>{lastInteraction}</span>
					</div>
					{/* Responsável da mesa (spec 2026-07-03): quem assumiu o caso, ou "aguardando". */}
					{lead.activeHandoff && (
						<div className="flex items-center gap-1.5" data-testid="lead-responsavel">
							<Headset className="size-3 text-indigo-600 dark:text-indigo-400" />
							<span className="text-foreground">
								{lead.activeHandoff.attendant
									? lead.activeHandoff.attendant.nome
									: "Aguardando mesa"}
							</span>
						</div>
					)}

					{/* Avanço sem arrastar. `stopPropagation` porque o card inteiro é
					    clicável (abre o detalhe) — sem isso, avançar abriria o painel junto. */}
					{proximaEtapa && onAvancar && (
						<button
							type="button"
							data-testid="avancar-etapa"
							onClick={(e) => {
								e.stopPropagation();
								onAvancar(lead.id, proximaEtapa);
							}}
							className="mt-0.5 flex w-full items-center justify-center gap-1 rounded-md border border-dashed px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground"
						>
							<ArrowRight className="size-3" aria-hidden />
							{rotuloDoEstagio(proximaEtapa)}
						</button>
					)}

					{/* Saída por PERDA. Discreto de propósito: é ação terminal, não deve
					    competir visualmente com o avanço. Ícone + texto (nunca só cor). */}
					{podePerder && onAvancar && (
						<button
							type="button"
							data-testid="marcar-perdido"
							onClick={(e) => {
								e.stopPropagation();
								onAvancar(lead.id, "perdido");
							}}
							className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						>
							<XCircle className="size-3" aria-hidden />
							Marcar como perdido
						</button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
