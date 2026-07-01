"use client";

import { ArrowDown } from "lucide-react";
import { motion } from "motion/react";
import {
	Fragment,
	type TouchEvent as ReactTouchEvent,
	type WheelEvent as ReactWheelEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import type { AjaUIMessage, TransitionPartData } from "@/lib/chat/ui-message";
import { WELCOME_OPTIONS } from "@/lib/chat/welcome-options";
import { WelcomeCategories } from "./artifacts/welcome-categories";
import { AssistantAvatar, ChatMessage } from "./chat-message";
import { nextStickState } from "./scroll-intent";

type Category = "imovel" | "auto" | "moto" | "servicos";

interface MessageListProps {
	messages: AjaUIMessage[];
	isStreaming: boolean;
	hasError?: boolean;
	onRetry?: () => void;
}

export function MessageList({ messages, isStreaming, hasError, onRetry }: MessageListProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	// `stick` = INTENÇÃO de acompanhar o fundo (não só estar nele). Inicia colado.
	// O gesto do usuário (wheel/touch pra cima, ou rolar pra longe do fundo)
	// SEMPRE vence e solta o stick — inclusive durante o streaming. Voltar ao
	// fundo, ou clicar no pill, religa. FIX-32: separa intenção de posição.
	const [stick, setStick] = useState(true);
	// FIX-49: a pill só faz sentido depois de um GESTO real do usuário ("você
	// subiu, clique pra voltar"). Sem isso, a hidratação da retomada (scroll
	// programático pro fim) acendia a pill como se houvesse mensagem não lida.
	const [userScrolled, setUserScrolled] = useState(false);
	// Distingue scroll PROGRAMÁTICO (nosso) de gesto do usuário, pra o onScroll
	// não religar/soltar o stick por causa do auto-scroll.
	const programmaticRef = useRef(false);
	// FIX-111: coalesce o auto-scroll numa única chamada por frame (rajada de tokens).
	const scrollRafRef = useRef<number | null>(null);
	const touchStartY = useRef<number | null>(null);
	// FIX-49: âncora de retomada — índice da última mensagem hidratada (histórico).
	// O divisor "Você voltou" entra logo depois dela (antes do 1º turno novo).
	const lastResumedIndex = messages.reduce((acc, m, i) => (m.metadata?.resumed ? i : acc), -1);

	const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
		programmaticRef.current = true;
		sentinelRef.current?.scrollIntoView({ behavior });
		// Libera no próximo frame — depois que o scroll programático assentou.
		requestAnimationFrame(() => {
			programmaticRef.current = false;
		});
	}, []);

	// FIX-49: na MONTAGEM com histórico (retomada hidratada), ancora direto no fim
	// — instantâneo, antes da pintura — pra não "cair no começo" da conversa antiga.
	// Layout effect roda 1x; o auto-scroll suave abaixo cuida dos turnos seguintes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: âncora de mount, roda 1x
	useLayoutEffect(() => {
		if (messages.length > 0) scrollToBottom("auto");
	}, []);

	// Auto-scroll SÓ quando colado. Sem `|| isStreaming` (FIX-32 Defeito 1): se o
	// usuário soltou o stick durante o streaming, o conteúdo cresce mas a posição
	// dele é preservada — o scroll não disputa com o gesto. FIX-111: coalesce numa
	// chamada por frame (rAF) — sem isso era 1 scroll por token, que somado ao
	// flip-flop do threshold causava o "indo e voltando".
	// biome-ignore lint/correctness/useExhaustiveDependencies: `messages` é TRIGGER de novo conteúdo (cada token/card), não dependência lida no corpo
	useEffect(() => {
		if (!stick) return;
		if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
		scrollRafRef.current = requestAnimationFrame(() => {
			scrollRafRef.current = null;
			scrollToBottom(isStreaming ? "auto" : "smooth");
		});
		return () => {
			if (scrollRafRef.current != null) {
				cancelAnimationFrame(scrollRafRef.current);
				scrollRafRef.current = null;
			}
		};
	}, [messages, isStreaming, stick, scrollToBottom]);

	// Posição real do scroll governa a intenção (substitui o IntersectionObserver
	// do sentinel — FIX-32 Defeito 2). Ignora o nosso próprio scroll programático.
	// FIX-111: histerese (nextStickState) em vez de um único threshold — o stick
	// não alterna a cada px perto do fim, matando a oscilação.
	const handleScroll = useCallback(() => {
		const el = scrollContainerRef.current;
		if (!el || programmaticRef.current) return;
		setStick((prev) => nextStickState(prev, el));
	}, []);

	// Gesto explícito de subir solta o stick na hora — antes mesmo do scroll
	// mudar — pra matar a briga durante o streaming. Marca `userScrolled` (gesto
	// real) → libera a pill (FIX-49: hidratação não acende pill sem gesto).
	const handleWheel = useCallback((e: ReactWheelEvent) => {
		if (e.deltaY < 0) {
			setStick(false);
			setUserScrolled(true);
		}
	}, []);
	const handleTouchStart = useCallback((e: ReactTouchEvent) => {
		touchStartY.current = e.touches[0]?.clientY ?? null;
	}, []);
	const handleTouchMove = useCallback((e: ReactTouchEvent) => {
		const start = touchStartY.current;
		const cur = e.touches[0]?.clientY ?? null;
		// dedo descendo (cur > start) = conteúdo sobe = usuário quer o histórico
		if (start != null && cur != null && cur - start > 8) {
			setStick(false);
			setUserScrolled(true);
		}
	}, []);

	const onPillClick = useCallback(() => {
		setStick(true);
		scrollToBottom("smooth");
	}, [scrollToBottom]);

	const hasMessages = messages.length > 0;
	const showPill = !stick && hasMessages && userScrolled;

	return (
		<div
			ref={scrollContainerRef}
			data-message-list
			className="flex-1 overflow-y-auto"
			role="log"
			aria-live="polite"
			onScroll={handleScroll}
			onWheel={handleWheel}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
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
							<Fragment key={message.id}>
								<ChatMessage
									message={message}
									isNew={index >= messages.length - 2}
									onRetry={showRetry ? onRetry : undefined}
									isStreaming={isStreaming}
									isLast={isLast}
									activeCategory={activeCategory}
								/>
								{index === lastResumedIndex && <ResumeAnchor />}
							</Fragment>
						);
					});
				})()}

				{/* Bottom sentinel for IntersectionObserver + input clearance */}
				<div ref={sentinelRef} className="h-20 shrink-0" aria-hidden="true" />
			</div>

			{/* Scroll-to-bottom pill — aparece quando o usuário soltou o stick */}
			{showPill && (
				<div className="sticky bottom-4 flex justify-center">
					<Button
						variant="secondary"
						size="sm"
						onClick={onPillClick}
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

/** FIX-49 — âncora de retomada: divisor discreto entre o histórico hidratado e o
 * 1º turno novo. Responde "você parou AQUI, continue" em vez de despejar o log. */
function ResumeAnchor() {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
			data-testid="resume-anchor"
			className="flex w-full items-center gap-[11px] py-1 text-muted-foreground"
		>
			<div className="h-px flex-1 bg-border" />
			<span className="shrink-0 text-[11px]">Você voltou — continue de onde parou</span>
			<div className="h-px flex-1 bg-border" />
		</motion.div>
	);
}

export function EmptyState() {
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
