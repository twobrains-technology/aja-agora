"use client";

import {
	type BubbleAttachment,
	WhatsAppBubble,
} from "@/components/admin/simulator/whatsapp/whatsapp-bubble";

/**
 * Mensagem como as telas do painel já a carregam. `mediaType` só existe quando a
 * mensagem tem anexo (coluna nullable em `messages`).
 */
export interface MensagemDaConversa {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: string;
	mediaType?: string | null;
	mediaFilename?: string | null;
	/** Preenchido quando a mensagem saiu como template aprovado (HSM). */
	templateName?: string | null;
}

/**
 * A conversa com o cliente do jeito que ela EXISTE pra ele: bolhas, lado, hora.
 *
 * Por que existe: a timeline em lista mostra o histórico como registro de
 * sistema — ótimo pra auditar, péssimo pra atender. Quem vai responder um
 * cliente precisa bater o olho e entender o clima da conversa, e é isso que o
 * formato de WhatsApp entrega. O componente é solto de propósito: recebe
 * mensagens e nada mais, então qualquer tela que tenha uma conversa (kanban,
 * lista de conversas, o que vier) pode oferecer essa visão.
 *
 * `system` não é renderizado: é ruído de máquina que o cliente nunca viu.
 */
export function WhatsAppView({
	mensagens,
	vazio = "Nenhuma mensagem nesta conversa ainda.",
}: {
	mensagens: MensagemDaConversa[];
	vazio?: string;
}) {
	const visiveis = mensagens.filter((m) => m.role !== "system");

	if (visiveis.length === 0) {
		return (
			<div className="rounded-lg border bg-[#efeae2] p-6 text-center text-sm text-muted-foreground dark:bg-[#0b141a]">
				{vazio}
			</div>
		);
	}

	return (
		<div
			data-testid="whatsapp-view"
			// O bege é o fundo do WhatsApp. Não é enfeite: é o que faz o atendente
			// reconhecer na hora que está vendo a conversa como o cliente a vê.
			className="overflow-y-auto rounded-lg bg-[#efeae2] p-3 dark:bg-[#0b141a]"
		>
			{/* O fundo ocupa a tela toda, a LEITURA não. A bolha é `max-w-[80%]` da
			    coluna: sem teto aqui, num monitor largo ela viraria uma linha de
			    800px, que ninguém lê com conforto. É o mesmo que o WhatsApp Web faz. */}
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
				{visiveis.map((m) => (
					<WhatsAppBubble
						key={m.id}
						// O cliente é `user`; agente e atendente humano saem do mesmo lado,
						// porque pro cliente os dois são "a empresa".
						direction={m.role === "user" ? "received" : "sent"}
						text={m.content}
						createdAt={m.createdAt}
						attachment={anexoDe(m)}
						ehTemplate={Boolean(m.templateName)}
					/>
				))}
			</div>
		</div>
	);
}

function anexoDe(m: MensagemDaConversa): BubbleAttachment | null {
	if (!m.mediaType) return null;
	const tipo =
		m.mediaType === "image" || m.mediaType === "audio" ? m.mediaType : ("document" as const);
	return {
		tipo,
		// Endpoint que assina na hora — o histórico nunca guarda URL que expira.
		url: `/api/admin/messages/${m.id}/media`,
		filename: m.mediaFilename,
	};
}
