"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { SunMark } from "@/components/brand/sun-mark";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { TheaterChat } from "./theater-chat";
import { useTheater } from "./theater-context";

/** Geometria "teatro": painel centralizado, ~92% da largura (até 980px) × ~90% da altura. */
function geo() {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const W = Math.min(980, vw * (vw < 600 ? 0.96 : 0.92));
	const H = vh * (vh < 700 ? 0.94 : 0.9);
	return { W, H, L: (vw - W) / 2, T: (vh - H) / 2 };
}

/**
 * "Modo Teatro" — a casca de transição. O painel é SEMPRE posicionado na
 * geometria final (estado assentado = `transform: none`) e o morph acontece só
 * via `transform` (translate + scale) com a Web Animations API, partindo do
 * `rect` do elemento de origem. WAAPI assenta o estado final de forma
 * determinística neste runtime (CSS transitions de layout falham). O conteúdo
 * (stage + footer) nunca depende da animação pra existir — só faz fade *pra
 * dentro* do estado visível via `settled`, à prova de print / reduced-motion /
 * aba throttled (com safety-timeout).
 */
export function ChatTheater() {
	const { isOpen, seed, seedOrigin, originRef, closeTheater } = useTheater();
	const reduce = useReducedMotion();
	const [mounted, setMounted] = useState(false);
	const [settled, setSettled] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const scrimRef = useRef<HTMLButtonElement>(null);
	const closingRef = useRef(false);
	// Lê o valor mais recente de `reduce` dentro de callbacks imperativos.
	const reduceRef = useRef(reduce);
	reduceRef.current = reduce;

	const applyGeometry = useCallback(() => {
		const panel = panelRef.current;
		const g = geo();
		if (panel) {
			panel.style.top = `${g.T}px`;
			panel.style.left = `${g.L}px`;
			panel.style.width = `${g.W}px`;
			panel.style.height = `${g.H}px`;
			panel.style.transform = "none";
		}
		return g;
	}, []);

	const runClose = useCallback(() => {
		closingRef.current = true;
		const panel = panelRef.current;
		const scrim = scrimRef.current;
		const origin = originRef.current?.getBoundingClientRect();
		const finish = () => {
			document.body.style.overflow = "";
			setSettled(false);
			setMounted(false);
			closingRef.current = false;
			originRef.current?.focus?.();
		};
		if (reduceRef.current || !panel || !scrim || !origin) {
			finish();
			return;
		}
		const g = geo();
		scrim.animate([{ opacity: 1 }, { opacity: 0 }], {
			duration: 300,
			easing: "ease",
			fill: "forwards",
		});
		setSettled(false);
		const tx = origin.left - g.L;
		const ty = origin.top - g.T;
		const sx = origin.width / g.W;
		const sy = origin.height / g.H;
		const fx = panel.animate(
			[
				{ transform: "none", opacity: 1 },
				{ transform: `translate(${tx}px,${ty}px) scale(${sx},${sy})`, opacity: 0.5 },
			],
			{ duration: 420, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
		);
		fx.onfinish = finish;
	}, [originRef]);

	const runOpen = useCallback(() => {
		const panel = panelRef.current;
		const scrim = scrimRef.current;
		if (!panel || !scrim) return;
		const g = applyGeometry();
		document.body.style.overflow = "hidden";

		if (reduceRef.current) {
			scrim.style.opacity = "1";
			setSettled(true);
			return;
		}
		scrim.style.opacity = "1";
		scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: "ease" });

		const origin = originRef.current?.getBoundingClientRect();
		if (!origin) {
			setSettled(true);
			return;
		}
		const tx = origin.left - g.L;
		const ty = origin.top - g.T;
		const sx = origin.width / g.W;
		const sy = origin.height / g.H;
		const fx = panel.animate(
			[
				{ transform: `translate(${tx}px,${ty}px) scale(${sx},${sy})`, opacity: 0.6 },
				{ transform: "none", opacity: 1 },
			],
			{ duration: 520, easing: "cubic-bezier(.22,1,.36,1)" },
		);
		fx.onfinish = () => setSettled(true);
		// Safety: garante conteúdo visível mesmo se onfinish não disparar (aba throttled).
		window.setTimeout(() => setSettled(true), 640);
	}, [applyGeometry, originRef]);

	// Monta ao abrir; dispara o morph reverso ao fechar.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reage só à troca de isOpen
	useEffect(() => {
		if (isOpen) {
			closingRef.current = false;
			setMounted(true);
		} else if (mounted && !closingRef.current) {
			runClose();
		}
	}, [isOpen]);

	// Anima a entrada assim que o painel está no DOM (antes do paint).
	// biome-ignore lint/correctness/useExhaustiveDependencies: dispara ao montar
	useLayoutEffect(() => {
		if (mounted && isOpen) runOpen();
	}, [mounted]);

	// Esc fecha; resize re-assenta a geometria.
	useEffect(() => {
		if (!mounted) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") closeTheater();
		};
		const onResize = () => {
			if (!reduceRef.current) applyGeometry();
		};
		window.addEventListener("keydown", onKey);
		window.addEventListener("resize", onResize);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("resize", onResize);
		};
	}, [mounted, closeTheater, applyGeometry]);

	if (!mounted) return null;

	const fade = settled || reduce;

	return createPortal(
		<div
			className="fixed inset-0 z-[90]"
			role="dialog"
			aria-modal="true"
			aria-label="Conversa com a Aja Agora"
			data-testid="chat-theater"
		>
			{/* Scrim — navy translúcido + blur. Clique fecha. */}
			<button
				type="button"
				ref={scrimRef}
				onClick={closeTheater}
				aria-label="Fechar conversa"
				tabIndex={-1}
				data-testid="theater-scrim"
				className="absolute inset-0 cursor-default bg-[rgba(8,20,34,0.5)] backdrop-blur-[7px]"
				style={{ opacity: 0 }}
			/>
			{/* Painel — posicionado na geometria final; morph só via transform. */}
			<div
				ref={panelRef}
				className="fixed flex flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_50px_130px_-30px_rgba(8,20,34,0.55)]"
				style={{ transformOrigin: "0 0" }}
			>
				{/* Cabeçalho */}
				<div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-[15px]">
					<div className="flex items-center gap-[11px]">
						<span className="flex size-[34px] items-center justify-center rounded-full bg-[var(--surface-ink)] p-1.5">
							<SunMark variant="white" className="size-full" />
						</span>
						<div>
							<div className="text-base font-semibold leading-[1.1] tracking-[-0.01em] text-foreground">
								Aja Agora
							</div>
							<div className="mt-px flex items-center gap-1.5 text-xs font-medium text-success">
								<span className="size-1.5 rounded-full bg-success" />
								online agora
							</div>
						</div>
					</div>
					<button
						type="button"
						onClick={closeTheater}
						aria-label="Fechar conversa"
						data-testid="theater-close"
						className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<X className="size-[18px]" />
					</button>
				</div>

				{/* Chat de produção real — stage (mensagens + artefatos) + footer (composer) */}
				<TheaterChat seed={seed} seedOrigin={seedOrigin} settled={fade} />
			</div>
		</div>,
		document.body,
	);
}
