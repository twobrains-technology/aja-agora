"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";
import { cn } from "@/lib/utils";

interface ChatInputProps {
	isStreaming: boolean;
	/** "theater" = shell em row arredondada do painel teatro; "default" = barra fullscreen. */
	variant?: "default" | "theater";
}

export function ChatInput({ isStreaming, variant = "default" }: ChatInputProps) {
	const { sendUserMessage, resetAll } = useChatContext();
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Devolve o foco ao input assim que o agente TERMINA de responder (streaming
	// vira false) — pra o usuário digitar a próxima mensagem sem precisar clicar
	// (pedido do Kairo). O textarea fica `disabled` no streaming e perde o foco;
	// re-habilitar não o devolve sozinho. Cobre também o mount (isStreaming começa
	// false). rAF + checagem de activeElement evita ROUBAR o foco de um card de
	// gate que já se auto-focou (name-prompt/gate-identity-form usam autoFocus).
	useEffect(() => {
		if (isStreaming) return;
		const id = requestAnimationFrame(() => {
			const active = document.activeElement;
			const outroCampoJaFocado =
				active instanceof HTMLElement &&
				active !== document.body &&
				active !== textareaRef.current &&
				(active.tagName === "INPUT" ||
					active.tagName === "TEXTAREA" ||
					active.isContentEditable);
			if (!outroCampoJaFocado) textareaRef.current?.focus();
		});
		return () => cancelAnimationFrame(id);
	}, [isStreaming]);

	const handleInput = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
	}, []);

	const handleSend = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed || isStreaming) return;
		// D17 — comando oculto: match EXATO (espelha o /reset do WhatsApp,
		// processor.ts). Reseta o agente (conversa + memória + cookie) sem
		// virar mensagem — nunca chega ao LLM nem ao histórico.
		if (trimmed.toLowerCase() === "/reset") {
			void resetAll();
		} else {
			void sendUserMessage(trimmed);
		}
		setValue("");
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
		});
	}, [value, isStreaming, sendUserMessage, resetAll]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[handleSend],
	);

	const canSend = value.trim().length > 0 && !isStreaming;
	const isTheater = variant === "theater";

	return (
		<div
			className={cn(
				"sticky bottom-0 z-10 border-t border-border pb-[env(safe-area-inset-bottom)]",
				isTheater ? "bg-card px-5 py-3.5" : "bg-background",
			)}
		>
			<div
				className={cn(
					"mx-auto flex items-end",
					isTheater
						? "max-w-[720px] gap-2.5 rounded-[15px] border border-border bg-muted py-1.5 pr-1.5 pl-4 transition-colors focus-within:border-primary/30 focus-within:bg-card"
						: "max-w-3xl gap-2 px-4 py-3",
				)}
			>
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => {
						setValue(e.target.value);
						handleInput();
					}}
					onKeyDown={handleKeyDown}
					inputMode="text"
					// Chat livre: sem autofill do browser (evita o dropdown nativo
					// sugerindo mensagens antigas fora de contexto no campo).
					autoComplete="off"
					placeholder={isTheater ? "Escreva sua mensagem…" : "Diga o que você quer realizar..."}
					disabled={isStreaming}
					rows={1}
					aria-label="Digite sua mensagem"
					className={cn(
						"flex-1 resize-none text-base outline-none transition-colors",
						"placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
						isTheater
							? "bg-transparent py-2"
							: cn(
									"rounded-lg border border-input bg-transparent px-3 py-2.5",
									"focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
									"dark:bg-input/30",
								),
					)}
					style={{ height: "auto", maxHeight: "120px", overflow: "auto" }}
				/>
				<Button
					variant="default"
					size="icon"
					onClick={handleSend}
					disabled={!canSend}
					aria-label="Enviar mensagem"
					className={cn("shrink-0", isTheater ? "size-10 rounded-[11px]" : "size-11")}
				>
					<Send className="size-4" />
				</Button>
			</div>
		</div>
	);
}
