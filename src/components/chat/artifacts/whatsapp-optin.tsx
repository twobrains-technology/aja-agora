"use client";

import { MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatContext } from "@/lib/chat/provider";
import type { WhatsappOptinPayload } from "@/lib/chat/types";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

const motionEntry = {
	initial: { opacity: 0, y: 12 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -8 },
	transition: { duration: 0.3, ease: "easeOut" as const },
};

function formatPhoneMask(raw: string): string {
	const d = raw.replace(/\D/g, "").slice(0, 11);
	if (d.length === 0) return "";
	if (d.length <= 2) return `(${d}`;
	if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
	if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
	return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function normalizeDigits(masked: string): string {
	return masked.replace(/\D/g, "");
}

function isValidPhone(digits: string): boolean {
	// DDD válido (1-9) + 8 ou 9 dígitos
	return /^[1-9]{2}9?\d{8}$/.test(digits);
}

export function WhatsappOptin({ payload }: { payload?: WhatsappOptinPayload }) {
	const { sendAction } = useChatContext();
	const [masked, setMasked] = useState("");
	const [state, setState] = useState<"idle" | "accepted" | "declined">("idle");
	// FIX-27: número já conhecido → confirmação 1-clique. "Usar outro número"
	// reabre a coleta por input.
	const [collectMode, setCollectMode] = useState(false);
	const prefersReduced = useReducedMotion();
	const digits = normalizeDigits(masked);
	const valid = isValidPhone(digits);
	const knownPhone = payload?.knownPhone;
	const showConfirm = !!knownPhone && !collectMode;

	const handleAccept = () => {
		if (!valid || state !== "idle") return;
		void sendAction({ kind: "whatsapp_optin", phone: digits }, "Quero receber pelo WhatsApp");
		setState("accepted");
	};

	// FIX-27: confirma o canal usando o número JÁ salvo (sem re-digitar).
	const handleConfirmKnown = () => {
		if (state !== "idle") return;
		void sendAction({ kind: "whatsapp_optin_confirm" }, "Pode me chamar nesse número");
		setState("accepted");
	};

	const handleDecline = () => {
		if (state !== "idle") return;
		void sendAction({ kind: "whatsapp_optin_decline" }, "Agora não");
		setState("declined");
	};

	const anim = prefersReduced ? { initial: false as const, animate: { opacity: 1 } } : motionEntry;

	// Estilos do re-UX (develop #27) reaproveitados nos dois modos.
	const primaryBtn =
		"flex-1 h-[46px] min-h-[44px] rounded-[13px] bg-primary text-sm font-semibold text-primary-foreground shadow-[0_6px_16px_-6px_rgba(3,110,255,0.5)] hover:brightness-105";
	const secondaryBtn =
		"flex-1 h-[46px] min-h-[44px] rounded-[13px] border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted";

	return (
		<motion.div {...anim}>
			<div className="w-full max-w-sm rounded-[18px] border border-border bg-card p-[18px] shadow-lg flex flex-col gap-[14px]">
				{/* header */}
				<div className="flex flex-col gap-[2px]">
					<div className="flex items-center gap-2">
						<MessageSquare className="size-[17px] text-primary" />
						<span className="inline-flex h-6 items-center rounded-full bg-[var(--neutral-100)] px-[11px] text-[11px] font-semibold tracking-[0.02em] text-muted-foreground">
							Continuar pelo WhatsApp
						</span>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						Se algo acontecer com a conversa, te chamo por lá.
					</p>
				</div>

				{showConfirm ? (
					<>
						{/* FIX-27: número já informado → confirmação 1-clique, sem input vazio. */}
						<p className="text-sm">
							Posso te chamar no <span className="font-semibold text-foreground">{knownPhone}</span>
							?
						</p>
						<div className="flex flex-col gap-[9px] sm:flex-row">
							<Button
								type="button"
								onClick={handleConfirmKnown}
								disabled={state !== "idle"}
								className={primaryBtn}
							>
								{state === "accepted" ? "Anotado ✓" : "Pode sim"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => setCollectMode(true)}
								disabled={state !== "idle"}
								className={secondaryBtn}
							>
								Usar outro número
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={handleDecline}
								disabled={state !== "idle"}
								className={secondaryBtn}
							>
								{state === "declined" ? "Sem problema" : "Agora não"}
							</Button>
						</div>
					</>
				) : (
					<>
						{/* phone input */}
						<Input
							type="tel"
							inputMode="numeric"
							value={masked}
							onChange={(e) => setMasked(formatPhoneMask(e.target.value))}
							placeholder="(11) 98765-4321"
							disabled={state !== "idle"}
							className="h-[46px] rounded-xl border-border bg-background px-[13px] text-base text-foreground placeholder:text-[#9aa7b6] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 w-full"
						/>

						{/* actions */}
						<div className="flex gap-[9px]">
							<Button
								type="button"
								onClick={handleAccept}
								disabled={!valid || state !== "idle"}
								className={primaryBtn}
							>
								{state === "accepted" ? "Anotado ✓" : "Quero receber"}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={handleDecline}
								disabled={state !== "idle"}
								className={secondaryBtn}
							>
								{state === "declined" ? "Sem problema" : "Agora não"}
							</Button>
						</div>
					</>
				)}
			</div>
		</motion.div>
	);
}
