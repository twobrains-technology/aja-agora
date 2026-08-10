"use client";

import { Phone, Video } from "lucide-react";
import { ClientChatBox } from "@/components/admin/pipeline/client-chat-box";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type MensagemDaConversa, WhatsAppView } from "./whatsapp-view";

/**
 * A conversa em TELA CHEIA, no layout do WhatsApp — a visão de atendimento.
 *
 * O painel lateral serve pra dar uma olhada; atender de verdade, com a conversa
 * inteira à vista e o campo de resposta logo abaixo, precisa de espaço. É a
 * mesma linguagem visual do simulador (header escuro do contato, fundo bege,
 * bolhas), pra o atendente ver o que o cliente vê.
 *
 * O envio aqui é o MESMO `ClientChatBox` do painel — não uma segunda caixa de
 * texto. Duplicar isso significaria manter dois lugares com as regras de janela
 * de 24h, template e anexo, e um deles ficaria pra trás.
 */
export function AtendimentoWhatsAppDialog({
	open,
	onOpenChange,
	mensagens,
	conversationId,
	nomeDoContato,
	telefone,
	onEnviado,
}: {
	open: boolean;
	onOpenChange: (aberto: boolean) => void;
	mensagens: MensagemDaConversa[];
	conversationId?: string | null;
	nomeDoContato?: string | null;
	telefone?: string | null;
	onEnviado?: () => void;
}) {
	const nome = nomeDoContato?.trim() || "Cliente";
	const iniciais = nome.slice(0, 2).toUpperCase();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="flex h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0"
				data-testid="atendimento-whatsapp"
			>
				{/* Cabeçalho no tom do WhatsApp: quem é o cliente, sempre à vista. */}
				<div className="flex items-center gap-3 bg-[#008069] px-4 py-3 text-white dark:bg-[#202c33]">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/25 text-sm font-semibold">
						{iniciais}
					</div>
					<div className="min-w-0 flex-1">
						<DialogTitle className="truncate text-base font-medium text-white">{nome}</DialogTitle>
						<p className="truncate text-xs text-white/80">
							{telefone ? formatarTelefone(telefone) : "conversa pelo WhatsApp"}
						</p>
					</div>
					{/* Decorativos: completam a moldura do WhatsApp e deixam claro que é
					    uma RÉPLICA da tela do cliente, não um telefone de verdade. */}
					<Video className="size-5 opacity-60" aria-hidden />
					<Phone className="size-5 opacity-60" aria-hidden />
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] dark:bg-[#0b141a]">
					<div className="p-3">
						<WhatsAppView mensagens={mensagens} />
					</div>
				</div>

				<div className="border-t bg-background p-3">
					<ClientChatBox conversationId={conversationId} onSent={onEnviado} />
				</div>
			</DialogContent>
		</Dialog>
	);
}

/** 5562999887766 → +55 (62) 99988-7766. Número cru no cabeçalho fica ilegível. */
function formatarTelefone(e164: string): string {
	const d = e164.replace(/\D/g, "");
	if (d.length < 12) return e164;
	const ddd = d.slice(2, 4);
	const resto = d.slice(4);
	const meio = resto.length > 8 ? resto.slice(0, 5) : resto.slice(0, 4);
	return `+55 (${ddd}) ${meio}-${resto.slice(meio.length)}`;
}
