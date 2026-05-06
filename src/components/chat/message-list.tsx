"use client";

import { ArrowDown } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AjaUIMessage, GatePartOption, TransitionPartData } from "@/lib/chat/ui-message";
import { WelcomeCategories } from "./artifacts/welcome-categories";
import { AssistantAvatar, ChatMessage } from "./chat-message";

type Category = "imovel" | "auto" | "servicos";

interface MessageListProps {
	messages: AjaUIMessage[];
	isStreaming: boolean;
	hasError?: boolean;
	onRetry?: () => void;
}

export function MessageList({ messages, isStreaming, hasError, onRetry }: MessageListProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const [isAtBottom, setIsAtBottom] = useState(true);

	// Track whether user is at the bottom via IntersectionObserver
	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				setIsAtBottom(entry.isIntersecting);
			},
			{
				root: scrollContainerRef.current,
				threshold: 0.5,
			},
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, []);

	// Auto-scroll when at bottom or streaming
	useEffect(() => {
		if (isAtBottom || isStreaming) {
			sentinelRef.current?.scrollIntoView({
				behavior: isStreaming ? "auto" : "smooth",
			});
		}
	}, [messages, isStreaming, isAtBottom]);

	const scrollToBottom = useCallback(() => {
		sentinelRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const hasMessages = messages.length > 0;

	return (
		<div
			ref={scrollContainerRef}
			data-message-list
			className="flex-1 overflow-y-auto"
			role="log"
			aria-live="polite"
		>
			<div className="flex flex-col gap-6 px-4 py-4 sm:px-6">
				{!hasMessages && <EmptyState />}

				{(() => {
					let activeCategory: Category | null = null;
					return messages.map((message, index) => {
						const isLast = index === messages.length - 1;
						const showRetry = isLast && message.role === "assistant" && hasError && !!onRetry;
						const transitionPart = message.parts.find((p) => p.type === "data-transition");
						if (transitionPart) {
							activeCategory = (transitionPart.data as TransitionPartData).toCategory;
						}
						return (
							<ChatMessage
								key={message.id}
								message={message}
								isNew={index >= messages.length - 2}
								onRetry={showRetry ? onRetry : undefined}
								isStreaming={isStreaming}
								isLast={isLast}
								activeCategory={activeCategory}
							/>
						);
					});
				})()}

				{/* Bottom sentinel for IntersectionObserver + input clearance */}
				<div ref={sentinelRef} className="h-20 shrink-0" aria-hidden="true" />
			</div>

			{/* Scroll-to-bottom pill when user has scrolled up */}
			{!isAtBottom && hasMessages && (
				<div className="sticky bottom-4 flex justify-center">
					<Button
						variant="secondary"
						size="sm"
						onClick={scrollToBottom}
						className="gap-1.5 rounded-full shadow-md"
					>
						<ArrowDown className="size-3.5" />
						<span>Novas mensagens</span>
					</Button>
				</div>
			)}
		</div>
	);
}

const WELCOME_OPTIONS: GatePartOption[] = [
	{ value: "imovel", label: "Imóvel" },
	{ value: "auto", label: "Automóvel" },
	{ value: "servicos", label: "Outros" },
];

function EmptyState() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 30 }}
			className="flex w-full flex-col gap-2"
		>
			<div className="flex w-full items-start gap-2 sm:gap-3">
				<AssistantAvatar />
				<div className="flex min-w-0 flex-1 flex-col items-start gap-3">
					<div className="max-w-full whitespace-pre-wrap rounded-2xl rounded-bl-lg bg-muted px-3 py-2 text-base text-foreground sm:px-4 sm:py-2.5">
						Olá! Sou seu consultor de consórcio.{"\n\n"}
						Me conta: o que você quer conquistar?
					</div>
					<div className="w-full">
						<WelcomeCategories payload={{ options: WELCOME_OPTIONS }} />
					</div>
				</div>
			</div>
		</motion.div>
	);
}
