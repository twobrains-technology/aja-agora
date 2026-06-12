"use client";

import { useEffect, useRef } from "react";

import { ChatProvider, useChatContext } from "@/lib/chat/provider";
import { cn } from "@/lib/utils";
import { ChatInput } from "../chat-input";
import { MessageList } from "../message-list";

interface TheaterChatProps {
	/** Mensagem-semente: não-vazia vira a 1ª mensagem do usuário; vazia abre na saudação. */
	seed: string;
	/** Quando o morph assentou — controla o fade-in do stage + footer. */
	settled: boolean;
}

/**
 * O chat de produção REAL renderizado dentro do painel teatro. Cada abertura
 * monta um <ChatProvider> novo (conversa fresca); o fechamento desmonta e
 * descarta. ZERO mock — bate em /api/chat como o chat standalone.
 */
export function TheaterChat({ seed, settled }: TheaterChatProps) {
	return (
		<ChatProvider>
			<TheaterChatBody seed={seed} settled={settled} />
		</ChatProvider>
	);
}

function TheaterChatBody({ seed, settled }: TheaterChatProps) {
	const { messages, status, regenerate, error, sendUserMessage } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	// `sendUserMessage` muda de identidade a cada render (depende do objeto do
	// useChat). Guardamos a referência mais recente num ref pra NÃO colocá-la nas
	// deps do effect — senão o cleanup/re-run mata o timer de 480ms antes dele
	// disparar (agravado pelo double-invoke do StrictMode em dev).
	const sendRef = useRef(sendUserMessage);
	sendRef.current = sendUserMessage;

	// Semente → 1ª mensagem do usuário, depois do morph assentar. Depende só de
	// `seed` (estável durante a sessão do teatro), então roda uma vez e o timer
	// chega ao fim — e sobrevive ao remount do StrictMode (reagenda no cleanup).
	useEffect(() => {
		const trimmed = seed.trim();
		if (!trimmed) return;
		const timer = setTimeout(() => {
			void sendRef.current(trimmed);
		}, 480);
		return () => clearTimeout(timer);
	}, [seed]);

	return (
		<>
			<div
				className={cn(
					"flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-card to-[#f7f9fc] transition-opacity duration-300",
					settled ? "opacity-100" : "opacity-0",
				)}
			>
				<div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col overflow-hidden">
					<MessageList
						messages={messages}
						isStreaming={isStreaming}
						hasError={!!error}
						onRetry={regenerate}
					/>
				</div>
			</div>
			<div
				className={cn(
					"shrink-0 transition-opacity duration-300",
					settled ? "opacity-100" : "opacity-0",
				)}
			>
				<ChatInput isStreaming={isStreaming} variant="theater" />
			</div>
		</>
	);
}
