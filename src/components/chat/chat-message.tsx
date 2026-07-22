"use client";

import {
	AlertCircle,
	Bike,
	Briefcase,
	Car,
	Headset,
	Home,
	type LucideIcon,
	RotateCcw,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { SunMark } from "@/components/brand/sun-mark";
import { Button } from "@/components/ui/button";
import type { Artifact } from "@/lib/chat/types";
import type {
	AjaUIMessage,
	ArtifactPartData,
	GatePartData,
	HandoffPartData,
	ToolStatusPartData,
	TransitionPartData,
	WelcomePartData,
} from "@/lib/chat/ui-message";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { useSmoothText } from "@/lib/hooks/use-smooth-text";
import { ArtifactRenderer } from "./artifact-renderer";
import { GateRenderer } from "./artifacts/gate-renderer";
import { WelcomeCategories } from "./artifacts/welcome-categories";
import { RevealSelectionProvider } from "./reveal-selection";
import { StreamingDots } from "./streaming-dots";

type Category = "imovel" | "auto" | "moto" | "servicos";

interface ChatMessageProps {
	message: AjaUIMessage;
	isNew?: boolean;
	onRetry?: () => void;
	isStreaming?: boolean;
	isLast?: boolean;
	activeCategory?: Category | null;
}

const messageSpring = {
	type: "spring" as const,
	stiffness: 300,
	damping: 30,
};

type RenderablePart =
	| { kind: "text"; id: string; text: string }
	| { kind: "transition"; id: string; data: TransitionPartData }
	| { kind: "artifact"; id: string; artifact: Artifact }
	| { kind: "gate"; id: string; data: GatePartData }
	| { kind: "welcome"; id: string; data: WelcomePartData }
	| { kind: "handoff"; id: string; data: HandoffPartData };

function classifyParts(message: AjaUIMessage): RenderablePart[] {
	const out: RenderablePart[] = [];
	for (let i = 0; i < message.parts.length; i++) {
		const part = message.parts[i];
		const partId = `${message.id}-${i}`;
		if (part.type === "text") {
			out.push({ kind: "text", id: partId, text: part.text });
			continue;
		}
		if (part.type === "data-transition") {
			out.push({ kind: "transition", id: partId, data: part.data as TransitionPartData });
			continue;
		}
		if (part.type === "data-artifact") {
			const data = part.data as ArtifactPartData;
			out.push({
				kind: "artifact",
				id: partId,
				artifact: { id: partId, ...data } as Artifact,
			});
			continue;
		}
		if (part.type === "data-gate") {
			out.push({ kind: "gate", id: partId, data: part.data as GatePartData });
			continue;
		}
		if (part.type === "data-welcome") {
			out.push({ kind: "welcome", id: partId, data: part.data as WelcomePartData });
			continue;
		}
		if (part.type === "data-handoff") {
			out.push({ kind: "handoff", id: partId, data: part.data as HandoffPartData });
		}
	}
	return out;
}

function latestToolName(message: AjaUIMessage): string | undefined {
	for (let i = message.parts.length - 1; i >= 0; i--) {
		const part = message.parts[i];
		if (part.type === "data-tool") {
			return (part.data as ToolStatusPartData).tool;
		}
	}
	return undefined;
}

type RenderableSegment =
	| { kind: "text-group"; id: string; text: string }
	| Exclude<RenderablePart, { kind: "text" } | { kind: "transition" }>;

/** FIX-184 — colapsa eco/degeneração da LLM ("Prazer, Mirella!Prazer, Mirella!")
 * no RENDER do cliente. O runner já aplica a MESMA guarda (`collapseEchoedSegments`)
 * na PERSISTÊNCIA, mas só DEPOIS do streaming — o texto AO VIVO chega ao cliente
 * com o eco cru (o DB fica limpo, a tela não). Este espelho client-side faz a tela
 * bater com o DB. É self-contained de propósito: NÃO importa do runner (server-only,
 * e a função do runner é mexida em paralelo pelo bloco-a/FIX-182). Mesma semântica:
 * só colapsa segmentos [.!?] 100% idênticos consecutivos (compara com trim, então
 * pega tanto o eco concatenado quanto o separado por "\n\n" do join de parts). */
function collapseEchoedText(text: string): string {
	if (!text) return text;
	const segments = text.split(/(?<=[.!?])/);
	if (segments.length < 2) return text;
	const out: string[] = [];
	for (const segment of segments) {
		const previous = out[out.length - 1];
		if (previous !== undefined && segment.trim().length > 0 && previous.trim() === segment.trim()) {
			continue;
		}
		out.push(segment);
	}
	return out.join("");
}

function groupAdjacentText(parts: RenderablePart[]): RenderableSegment[] {
	const out: RenderableSegment[] = [];
	let buffer: { id: string; text: string }[] = [];

	const flush = () => {
		if (buffer.length === 0) return;
		const joined = buffer
			.map((b) => b.text)
			.filter(Boolean)
			.join("\n\n");
		const text = collapseEchoedText(joined);
		if (text.length > 0) {
			out.push({ kind: "text-group", id: buffer[0].id, text });
		}
		buffer = [];
	};

	for (const part of parts) {
		if (part.kind === "transition") continue;
		if (part.kind === "text") {
			buffer.push({ id: part.id, text: part.text });
			continue;
		}
		flush();
		out.push(part);
	}
	flush();

	return out;
}

export function ChatMessage({
	message,
	isNew = false,
	onRetry,
	isStreaming = false,
	isLast = false,
	activeCategory = null,
}: ChatMessageProps) {
	const isUser = message.role === "user";
	const prefersReduced = useReducedMotion();
	const parts = classifyParts(message);
	// FIX-196 — cotas do reveal (recommendation_card + comparison_table desta
	// mensagem) alimentam o contexto de seleção compartilhado (hero + seletor +
	// dial rebindam à cota escolhida). Fora de um reveal, o provider fica inerte.
	const revealArtifacts = useMemo(
		() =>
			parts
				.filter((p): p is Extract<RenderablePart, { kind: "artifact" }> => p.kind === "artifact")
				.map((p) => p.artifact),
		[parts.filter],
	);
	// FIX-49 selava TODA mensagem hidratada da retomada — inclusive a ÚLTIMA. Ao
	// vivo isso virou beco: o cliente voltava, o único card da tela estava com o
	// botão desabilitado, e o agente ficava pedindo "clica no card" pra algo que
	// não dava pra clicar. O histórico continua selado; só o ÚLTIMO card volta a
	// responder, que é onde a conversa de fato está. A duplicação que o FIX-48
	// temia hoje é coberta pelo `dup-click-guard` do route.ts.
	const isResumed = message.metadata?.resumed === true;
	const isInteractive = isLast;
	void isResumed;
	const [completedTextIds, setCompletedTextIds] = useState<Set<string>>(() => new Set());
	const handleTextComplete = useCallback((id: string) => {
		setCompletedTextIds((prev) => {
			if (prev.has(id)) return prev;
			const next = new Set(prev);
			next.add(id);
			return next;
		});
	}, []);

	const animationProps =
		isNew && !prefersReduced
			? {
					initial: { opacity: 0, y: 12 } as const,
					animate: { opacity: 1, y: 0 } as const,
					transition: messageSpring,
				}
			: {
					initial: false as const,
					animate: { opacity: 1, y: 0 } as const,
				};

	if (isUser) {
		const text = parts
			.filter((p): p is Extract<RenderablePart, { kind: "text" }> => p.kind === "text")
			.map((p) => p.text)
			.join("");
		return (
			<motion.div {...animationProps} className="flex w-full flex-col items-end gap-1">
				{/* Balão do usuário: azul primário, texto branco, rabicho sup-dir */}
				<div className="max-w-[46ch] rounded-2xl rounded-tr-[5px] bg-[var(--aja-ink-soft)] px-[14px] py-[10px] text-[15px] leading-[1.55] text-white">
					<span className="whitespace-pre-wrap">{text}</span>
				</div>
			</motion.div>
		);
	}

	const transitionParts = parts.filter(
		(p): p is Extract<RenderablePart, { kind: "transition" }> => p.kind === "transition",
	);
	const inlineSegments = parts.filter((p) => p.kind !== "transition");
	const totalTextLength = inlineSegments.reduce(
		(acc, s) => (s.kind === "text" ? acc + s.text.length : acc),
		0,
	);
	const hasNonTextVisuals = inlineSegments.some((s) => s.kind !== "text");
	const isStreamingEmpty = isStreaming && isLast && totalTextLength === 0 && !hasNonTextVisuals;
	const currentTool = latestToolName(message);
	const showInflightDots =
		isStreaming &&
		isLast &&
		!isStreamingEmpty &&
		!hasNonTextVisuals &&
		(currentTool !== undefined || totalTextLength > 20);

	const firstTransition = transitionParts[0]?.data;

	return (
		<motion.div {...animationProps} className="flex w-full flex-col gap-2">
			{transitionParts.map((p) => (
				<TransitionDivider key={p.id} data={p.data} />
			))}

			<div className="flex w-full items-start gap-2 sm:gap-3">
				<AssistantAvatar category={activeCategory} />
				<div className="flex min-w-0 flex-1 flex-col items-start gap-2">
					{firstTransition && (
						<motion.span
							initial={{ opacity: 0, y: -2 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.25, delay: 0.1 }}
							className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
						>
							{firstTransition.toPersonaName}
							<span className="mx-1.5 opacity-50">·</span>
							{CATEGORY_TRANSITION[firstTransition.toCategory].role}
						</motion.span>
					)}

					{isStreamingEmpty && (
						<div className="max-w-full rounded-2xl rounded-tl-[5px] border border-border bg-card px-[14px] py-[10px] shadow-[0_1px_2px_rgba(5,36,64,0.05),0_8px_20px_-14px_rgba(5,36,64,0.2)]">
							<StreamingDots tool={currentTool} />
						</div>
					)}

					<RevealSelectionProvider artifacts={revealArtifacts}>
						<AnimatePresence mode="popLayout" initial={false}>
							{(() => {
								const segments = groupAdjacentText(inlineSegments);
								const lastTextIdx = segments.reduce(
									(acc, s, idx) => (s.kind === "text-group" ? idx : acc),
									-1,
								);
								const isStreamingLast = isStreaming && isLast;
								const allTextsBeforeReady = (idx: number): boolean => {
									for (let j = 0; j < idx; j++) {
										const s = segments[j];
										if (s.kind === "text-group" && !completedTextIds.has(s.id)) return false;
									}
									return true;
								};
								return segments.map((segment, i) => {
									if (segment.kind === "text-group") {
										const isFinal = i < segments.length - 1 || !isStreamingLast;
										return (
											<TextBubble
												key={segment.id}
												id={segment.id}
												text={segment.text}
												reducedMotion={prefersReduced}
												showCursor={isStreamingLast && i === lastTextIdx}
												isFinal={isFinal}
												onComplete={handleTextComplete}
											/>
										);
									}
									if (!allTextsBeforeReady(i)) return null;
									if (segment.kind === "artifact") {
										return (
											<motion.div
												key={segment.id}
												layout={!prefersReduced}
												initial={prefersReduced ? false : { opacity: 0, scale: 0.96, y: 8 }}
												animate={{ opacity: 1, scale: 1, y: 0 }}
												exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
												transition={{
													type: "spring",
													stiffness: 400,
													damping: 25,
													delay: prefersReduced ? 0 : i * 0.04,
												}}
												className="w-full"
											>
												<ArtifactRenderer artifact={segment.artifact} active={isInteractive} />
											</motion.div>
										);
									}
									if (segment.kind === "gate") {
										return (
											<motion.div
												key={segment.id}
												layout={!prefersReduced}
												initial={prefersReduced ? false : { opacity: 0, y: 6 }}
												animate={{ opacity: 1, y: 0 }}
												transition={{ duration: 0.2 }}
												className="w-full"
											>
												<GateRenderer payload={segment.data} active={isInteractive} />
											</motion.div>
										);
									}
									if (segment.kind === "welcome") {
										return (
											<motion.div
												key={segment.id}
												layout={!prefersReduced}
												initial={prefersReduced ? false : { opacity: 0, y: 6 }}
												animate={{ opacity: 1, y: 0 }}
												transition={{ duration: 0.2 }}
												className="w-full"
											>
												<WelcomeCategories payload={segment.data} active={isInteractive} />
											</motion.div>
										);
									}
									if (segment.kind === "handoff") {
										return (
											<motion.div
												key={segment.id}
												layout={!prefersReduced}
												initial={prefersReduced ? false : { opacity: 0, y: 6 }}
												animate={{ opacity: 1, y: 0 }}
												transition={{ duration: 0.2 }}
												className="w-full"
											>
												<HandoffPrompt data={segment.data} />
											</motion.div>
										);
									}
									return null;
								});
							})()}
						</AnimatePresence>
					</RevealSelectionProvider>

					{showInflightDots && (
						<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
							<StreamingDots tool={currentTool} />
						</motion.div>
					)}

					{onRetry && (
						<Button
							variant="ghost"
							size="sm"
							onClick={onRetry}
							disabled={isStreaming}
							className="gap-1.5 text-destructive hover:text-destructive"
						>
							<AlertCircle className="size-3.5" />
							<RotateCcw className="size-3.5" />
							<span>Tentar novamente</span>
						</Button>
					)}
				</div>
			</div>
		</motion.div>
	);
}

const CATEGORY_BADGE_COLOR: Record<Category, string> = {
	imovel: "var(--cat-imovel)",
	auto: "var(--cat-auto)",
	moto: "var(--cat-moto)",
	servicos: "var(--cat-servicos)",
};

export function AssistantAvatar({ category }: { category?: Category | null } = {}) {
	return (
		<motion.div
			key={category ?? "concierge"}
			initial={{ scale: 0.85, opacity: 0 }}
			animate={{ scale: 1, opacity: 1 }}
			transition={{ type: "spring", stiffness: 320, damping: 24 }}
			className="relative shrink-0"
		>
			{/* Avatar: marca-sol sempre navy */}
			<span
				className="flex size-8 items-center justify-center rounded-full bg-[var(--surface-ink)] p-[6px]"
				aria-hidden="true"
			>
				<SunMark variant="white" className="size-full" />
			</span>
			{/* Selo colorido por categoria — 13px, canto inf-dir, borda branca */}
			{category && (
				<span
					className="absolute -right-[2px] -bottom-[2px] size-[13px] rounded-full border-2 border-white"
					style={{ background: CATEGORY_BADGE_COLOR[category] }}
					aria-hidden="true"
				/>
			)}
		</motion.div>
	);
}

const CATEGORY_TRANSITION: Record<
	"imovel" | "auto" | "moto" | "servicos",
	{ icon: LucideIcon; short: string; role: string }
> = {
	imovel: { icon: Home, short: "imóveis", role: "Especialista em imóveis" },
	auto: { icon: Car, short: "automóveis", role: "Especialista em automóveis" },
	moto: { icon: Bike, short: "motos", role: "Especialista em motos" },
	servicos: { icon: Briefcase, short: "serviços", role: "Especialista em serviços" },
};

function TransitionDivider({ data }: { data: TransitionPartData }) {
	const cat = data.toCategory as Category;
	const catConfig = CATEGORY_TRANSITION[cat];
	const badgeColor = CATEGORY_BADGE_COLOR[cat];

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
			className="flex w-full flex-col items-center gap-2 py-1"
		>
			{/* Divisor com texto centralizado */}
			<div className="flex w-full items-center gap-[11px] text-muted-foreground">
				<div className="h-px flex-1 bg-border" />
				<span className="shrink-0 text-[11px]">{data.toPersonaName} entrou na conversa</span>
				<div className="h-px flex-1 bg-border" />
			</div>
			{/* Rótulo de papel: uppercase + ponto colorido por categoria */}
			<span className="inline-flex items-center gap-[7px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
				<span
					className="size-[7px] rounded-full shrink-0"
					style={{ background: badgeColor }}
					aria-hidden="true"
				/>
				{catConfig.role}
			</span>
		</motion.div>
	);
}

function HandoffPrompt(_props: { data: HandoffPartData }) {
	return (
		<div className="flex items-start gap-3 rounded-full border border-warning/40 bg-warning/10 px-3 py-[10px]">
			<Headset className="mt-[1px] size-4 shrink-0 text-warning" aria-hidden="true" />
			<div className="flex flex-col gap-1">
				<p className="text-xs font-medium leading-[1.5] text-foreground">
					Pra esse caso, recomendo conversar direto com nosso consultor humano.
				</p>
				{/* O `reason` é diagnóstico INTERNO, escrito pelo modelo pra quem vai
				    assumir a conversa — e vazava cru na tela do cliente: "Motivo:
				    Cliente confirmou fechamento e dados, mas a proposta não foi criada
				    no sistema (check_proposal_status retornou sem proposta)". Nome de
				    função interna na cara de quem está comprando. Quem precisa do
				    motivo é o atendente, e ele o lê no painel. */}
			</div>
		</div>
	);
}

function TextBubble({
	id,
	text,
	reducedMotion,
	showCursor,
	isFinal,
	onComplete,
}: {
	id: string;
	text: string;
	reducedMotion: boolean;
	showCursor: boolean;
	isFinal: boolean;
	onComplete?: (id: string) => void;
}) {
	const smoothed = useSmoothText(text, 110);
	const stillTyping = smoothed.length < text.length;
	const cursor = showCursor || stillTyping;

	useEffect(() => {
		if (!stillTyping && isFinal) onComplete?.(id);
	}, [stillTyping, isFinal, onComplete, id]);

	const proseClass =
		"prose prose-sm max-w-none dark:prose-invert prose-p:my-0.5 prose-p:leading-snug prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 prose-strong:text-foreground prose-headings:text-foreground prose-headings:text-sm prose-headings:font-semibold prose-headings:my-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0";
	return (
		<motion.div
			initial={reducedMotion ? false : { opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, ease: "easeOut" }}
			className="max-w-[62ch] rounded-2xl rounded-tl-[5px] border border-[color:var(--border-strong)] bg-card px-[14px] py-[10px] text-[15px] leading-[1.55] text-foreground shadow-[0_1px_2px_rgba(2,22,40,0.05)]"
		>
			<div className={cursor ? `${proseClass} streaming-text` : proseClass}>
				<ReactMarkdown>{smoothed}</ReactMarkdown>
			</div>
		</motion.div>
	);
}
