"use client";

import { ArrowLeft, RefreshCw, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import LogoSvg from "@/assets/svg/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { HandoffState } from "@/lib/chat/provider";

interface ChatLayoutProps {
	children: React.ReactNode;
	onReset?: () => void;
	error?: string | null;
	handoff?: HandoffState;
}

export function ChatLayout({ children, onReset, error, handoff }: ChatLayoutProps) {
	const router = useRouter();
	const [dismissedError, setDismissedError] = useState<string | null>(null);
	const showError = error && error !== dismissedError;

	const handleBack = useCallback(() => {
		if (typeof window !== "undefined" && window.history.length > 1) {
			router.back();
		} else {
			router.push("/");
		}
	}, [router]);

	// Virtual keyboard handling — scroll message list to bottom when keyboard opens
	useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;

		const handleResize = () => {
			document.querySelector("[data-message-list]")?.scrollTo({
				top: Number.MAX_SAFE_INTEGER,
				behavior: "smooth",
			});
		};

		viewport.addEventListener("resize", handleResize);
		return () => viewport.removeEventListener("resize", handleResize);
	}, []);

	return (
		<div className="flex h-dvh flex-col overflow-x-hidden bg-background">
			{/* Header — 48px, sticky top */}
			<header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
				<div className="flex items-center gap-3">
					<Button
						variant="ghost"
						size="icon"
						onClick={handleBack}
						aria-label="Voltar"
						className="size-8"
					>
						<ArrowLeft className="size-4" />
					</Button>
					<Link href="/" className="flex items-center gap-2">
						<LogoSvg className="size-7" />
						<span className="text-sm font-semibold">Aja Agora</span>
					</Link>
				</div>
				<div className="flex items-center gap-1">
					<ThemeToggle />
					{onReset && (
						<Button
							variant="ghost"
							size="icon"
							onClick={onReset}
							aria-label="Nova conversa"
							className="size-8"
						>
							<RefreshCw className="size-4" />
						</Button>
					)}
				</div>
			</header>

			{/* Dismissible error banner */}
			{showError && (
				<div className="flex items-center justify-between gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					<span>{error}</span>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setDismissedError(error)}
						className="size-7 shrink-0 text-destructive hover:text-destructive"
						aria-label="Fechar erro"
					>
						<X className="size-3.5" />
					</Button>
				</div>
			)}

			{/* Handoff banner — visible while talking to a human consultant */}
			{handoff?.status === "handed_off" && (
				<div className="flex items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-xs text-foreground">
					<UserCheck className="size-3.5 shrink-0 text-primary" />
					<span>
						{handoff.agentName ? (
							<>
								Falando com <span className="font-semibold">{handoff.agentName}</span>, seu
								consultor humano
							</>
						) : (
							"Aguardando um consultor humano se conectar..."
						)}
					</span>
				</div>
			)}

			{/* Content area — scrollable messages + fixed input */}
			<div className="relative flex flex-1 flex-col overflow-hidden">
				<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
					{children}
				</div>
			</div>
		</div>
	);
}
