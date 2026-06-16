"use client";

import { useEffect, useRef, useState } from "react";

import { ChatProvider, useChatContext } from "@/lib/chat/provider";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { cn } from "@/lib/utils";
import { ChatInput } from "../chat-input";
import { MessageList } from "../message-list";

interface TheaterChatProps {
	/** Mensagem-semente: não-vazia vira a próxima mensagem do usuário; vazia abre na saudação/retomada. */
	seed: string;
	/** Quando o morph assentou — controla o fade-in do stage + footer. */
	settled: boolean;
}

type ResumePayload = {
	conversationId: string;
	messages: { id: string; role: "user" | "assistant"; content: string }[];
};

type ResumeState =
	| { phase: "loading" }
	| { phase: "ready"; conversationId?: string; messages?: AjaUIMessage[] };

/**
 * O chat de produção REAL renderizado dentro do painel teatro — único ponto de
 * chat do produto (a rota /chat foi removida). Ao abrir, consulta
 * GET /api/chat/resume (FIX-46): se houver conversa same-device vinculada ao
 * cookie `aja_uid`, reidrata o histórico e CONTINUA de onde parou; o seed (texto
 * digitado / categoria clicada) vira a próxima mensagem dessa conversa. Sem
 * conversa anterior → conversa fresca (seed = 1ª mensagem, ou saudação se vazio).
 * ZERO mock — bate em /api/chat como produção.
 */
export function TheaterChat({ seed, settled }: TheaterChatProps) {
	const [resume, setResume] = useState<ResumeState>({ phase: "loading" });

	// Busca a retomada uma vez por abertura do teatro (o componente remonta a
	// cada open/close). A janela de fetch coincide com a animação de entrada.
	useEffect(() => {
		let alive = true;
		(async () => {
			try {
				const res = await fetch("/api/chat/resume", {
					headers: { "cache-control": "no-cache" },
				});
				const data = res.ok ? await res.json() : { conversation: null };
				const conv = (data?.conversation ?? null) as ResumePayload | null;
				if (!alive) return;
				if (conv && conv.messages.length > 0) {
					setResume({
						phase: "ready",
						conversationId: conv.conversationId,
						messages: conv.messages.map(
							(m) =>
								({
									id: m.id,
									role: m.role,
									parts: [{ type: "text", text: m.content }],
									// FIX-49: marca o histórico hidratado — a UI ancora o scroll,
									// mostra a âncora "Você voltou" e sela artifacts/gates antigos.
									metadata: { resumed: true },
								}) as AjaUIMessage,
						),
					});
				} else {
					setResume({ phase: "ready" });
				}
			} catch {
				if (alive) setResume({ phase: "ready" });
			}
		})();
		return () => {
			alive = false;
		};
	}, []);

	// Enquanto resolve a retomada, segura o mount do ChatProvider (ele lê o
	// estado inicial no primeiro render). O shell vazio respeita o fade do morph.
	if (resume.phase === "loading") {
		return <TheaterStage settled={settled} />;
	}

	return (
		<ChatProvider initialConversationId={resume.conversationId} initialMessages={resume.messages}>
			<TheaterChatBody seed={seed} settled={settled} />
		</ChatProvider>
	);
}

/** Casca visual do palco (stage + footer), reusada no loading e no chat montado. */
function TheaterStage({ settled, children }: { settled: boolean; children?: React.ReactNode }) {
	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-card to-[#f7f9fc] transition-opacity duration-300",
				settled ? "opacity-100" : "opacity-0",
			)}
		>
			<div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col overflow-hidden">
				{children}
			</div>
		</div>
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

	// Semente → próxima mensagem do usuário, depois do morph assentar. Vale tanto
	// pra conversa fresca (1ª mensagem) quanto pra retomada (continua a conversa).
	// Depende só de `seed` (estável durante a sessão do teatro), então roda uma vez.
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
			<TheaterStage settled={settled}>
				<MessageList
					messages={messages}
					isStreaming={isStreaming}
					hasError={!!error}
					onRetry={regenerate}
				/>
			</TheaterStage>
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
