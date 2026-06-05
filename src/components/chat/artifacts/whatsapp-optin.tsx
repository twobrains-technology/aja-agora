"use client";

import { MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatContext } from "@/lib/chat/provider";
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

export function WhatsappOptin() {
	const { sendAction } = useChatContext();
	const [masked, setMasked] = useState("");
	const [state, setState] = useState<"idle" | "accepted" | "declined">("idle");
	const prefersReduced = useReducedMotion();
	const digits = normalizeDigits(masked);
	const valid = isValidPhone(digits);

	const handleAccept = () => {
		if (!valid || state !== "idle") return;
		void sendAction({ kind: "whatsapp_optin", phone: digits }, "Quero receber pelo WhatsApp");
		setState("accepted");
	};

	const handleDecline = () => {
		if (state !== "idle") return;
		void sendAction({ kind: "whatsapp_optin_decline" }, "Agora não");
		setState("declined");
	};

	const anim = prefersReduced ? { initial: false as const, animate: { opacity: 1 } } : motionEntry;

	return (
		<motion.div {...anim}>
			<Card className="border-primary/30">
				<CardHeader className="space-y-1 pb-3">
					<div className="flex items-center gap-2">
						<MessageSquare className="h-4 w-4 text-primary" />
						<Badge variant="secondary">Continuar pelo WhatsApp</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						Se algo acontecer com a conversa, te chamo por lá.
					</p>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						type="tel"
						inputMode="numeric"
						value={masked}
						onChange={(e) => setMasked(formatPhoneMask(e.target.value))}
						placeholder="(11) 98765-4321"
						disabled={state !== "idle"}
						className="w-full min-h-[44px]"
					/>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Button
							type="button"
							onClick={handleAccept}
							disabled={!valid || state !== "idle"}
							className="flex-1 min-h-[44px]"
						>
							{state === "accepted" ? "Anotado ✓" : "Quero receber"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={handleDecline}
							disabled={state !== "idle"}
							className="flex-1 min-h-[44px]"
						>
							{state === "declined" ? "Sem problema" : "Agora não"}
						</Button>
					</div>
				</CardContent>
			</Card>
		</motion.div>
	);
}
