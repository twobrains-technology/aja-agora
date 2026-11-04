"use client";

import { MessageList } from "@/components/chat/message-list";
import { ChatProvider } from "@/lib/chat/provider";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { type Modo, rotuloDeModo, temPromessa } from "./chat-lado-a-lado";

function textoDe(m: AjaUIMessage): string {
	return m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
}

const bloqueia = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
	e.preventDefault();
	e.stopPropagation();
};

/** Um painel (Antes ou Depois) com os componentes da plataforma. Os cards
 * são somente leitura: clique e submit são barrados na captura, para nenhum
 * `sendAction` chegar a `/api/chat` e criar conversa real na dev (Q9). */
export function PainelDeConversa({ modo, mensagens }: { modo: Modo; mensagens: AjaUIMessage[] }) {
	const promessa = mensagens.some((m) => m.role === "assistant" && temPromessa(textoDe(m)));
	return (
		<section
			aria-label={`Conversa ${rotuloDeModo[modo]}`}
			className="flex min-w-0 flex-1 flex-col rounded border"
		>
			<h3 className="border-b px-2 py-1 text-sm font-medium">{rotuloDeModo[modo]}</h3>
			<div className="flex items-center gap-2 border-b px-2 py-0.5 text-xs">
				<span>Cards: somente leitura</span>
				{promessa && <span className="font-bold">PROMESSA DE CONTEMPLAÇÃO</span>}
			</div>
			<div
				className="flex max-h-[32rem] min-h-64 flex-col overflow-hidden"
				onClickCapture={bloqueia}
				onSubmitCapture={bloqueia}
				onKeyDownCapture={(e) => {
					if (e.key === "Enter" || e.key === " ") bloqueia(e);
				}}
			>
				<ChatProvider>
					<MessageList messages={mensagens} isStreaming={false} />
				</ChatProvider>
			</div>
		</section>
	);
}
