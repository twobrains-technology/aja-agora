"use client";

import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SunMark } from "@/components/brand/sun-mark";
import { Button } from "@/components/ui/button";

interface ChatLayoutProps {
	children: React.ReactNode;
	onReset?: () => void;
	error?: string | null;
}

export function ChatLayout({ children, onReset, error }: ChatLayoutProps) {
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
			{/* Header — identidade + status à esquerda, ação à direita */}
			<header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 shadow-[0_1px_2px_rgba(5,36,64,0.05),0_8px_20px_-14px_rgba(5,36,64,0.2)]">
				{/* Identidade: avatar-sol + nome + status online */}
				<div className="flex items-center gap-[11px]">
					<span
						className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-ink)] p-[6px]"
						aria-hidden="true"
					>
						<SunMark variant="white" className="size-full" />
					</span>
					<div className="flex flex-col leading-none">
						<span className="text-sm font-semibold text-foreground leading-[1.1]">Aja Agora</span>
						<span className="mt-[2px] flex items-center gap-[6px] text-[11px] font-medium text-success leading-none">
							<span className="size-[6px] rounded-full bg-success shrink-0" aria-hidden="true" />
							online agora
						</span>
					</div>
				</div>

				{/* Ações à direita */}
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={handleBack}
						aria-label="Voltar"
						className="size-8"
					>
						<ArrowLeft className="size-4" />
					</Button>
					{onReset && (
						<button
							type="button"
							onClick={onReset}
							aria-label="Nova conversa"
							className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<RefreshCw className="size-[18px]" />
						</button>
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

			{/* Content area — scrollable messages + fixed input */}
			<div className="relative flex flex-1 flex-col overflow-hidden">
				<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
					{children}
				</div>
			</div>
		</div>
	);
}
