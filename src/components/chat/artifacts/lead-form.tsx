"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatContext } from "@/lib/chat/provider";
import type { LeadFormPayload } from "@/lib/chat/types";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { type LeadFormData, leadSchema } from "@/lib/validations/lead";

const motionEntry = {
	initial: { opacity: 0, y: 12 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -8 },
	transition: { duration: 0.3, ease: "easeOut" },
};

const reducedMotionEntry = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
	transition: { duration: 0.15 },
};

export function LeadForm({ payload }: { payload: LeadFormPayload }) {
	const [submitted, setSubmitted] = useState(false);
	const { conversationId, sendUserMessage } = useChatContext();
	const prefersReduced = useReducedMotion();
	const anim = prefersReduced ? reducedMotionEntry : motionEntry;

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<LeadFormData>({
		resolver: zodResolver(leadSchema),
	});

	const onSubmit = async (data: LeadFormData) => {
		try {
			const response = await fetch("/api/leads", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...data,
					conversationId: conversationId ?? payload.conversationId,
				}),
			});

			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.error ?? "Erro ao enviar dados. Tente novamente.");
			}

			setSubmitted(true);

			void sendUserMessage("Dados enviados com sucesso");
		} catch (err) {
			setError("root", {
				message: err instanceof Error ? err.message : "Erro ao enviar dados. Tente novamente.",
			});
		}
	};

	return (
		<AnimatePresence mode="wait">
			{submitted ? (
				<motion.div key="success" {...anim}>
					<Card className="border-primary/30 bg-primary/5">
						<CardContent className="flex flex-col items-center gap-3 py-6">
							<CheckCircle className="h-8 w-8 text-primary" />
							<p className="text-lg font-semibold">Dados recebidos!</p>
							<p className="text-sm text-muted-foreground">Em breve entraremos em contato.</p>
						</CardContent>
					</Card>
				</motion.div>
			) : (
				<motion.div key="form" {...anim}>
					<Card className="border-primary/30">
						<CardHeader className="space-y-1 pb-3">
							<div className="flex items-center gap-2">
								<Badge variant="secondary">Seus dados</Badge>
							</div>
							<p className="text-sm text-muted-foreground">Para prosseguir com o consorcio</p>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
								{/* Nome */}
								<div className="space-y-1.5">
									<label htmlFor="lead-name" className="text-sm font-medium leading-none">
										Nome
									</label>
									<Input
										id="lead-name"
										type="text"
										placeholder="Seu nome completo"
										autoFocus
										className={cn("w-full min-h-[44px]", errors.name && "border-destructive")}
										{...register("name")}
									/>
									{errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
								</div>

								{/* Telefone */}
								<div className="space-y-1.5">
									<label htmlFor="lead-phone" className="text-sm font-medium leading-none">
										Telefone
									</label>
									<Input
										id="lead-phone"
										type="tel"
										inputMode="numeric"
										placeholder="11999998888"
										className={cn("w-full min-h-[44px]", errors.phone && "border-destructive")}
										{...register("phone")}
									/>
									{errors.phone && (
										<p className="text-xs text-destructive">{errors.phone.message}</p>
									)}
								</div>

								{/* Email */}
								<div className="space-y-1.5">
									<label htmlFor="lead-email" className="text-sm font-medium leading-none">
										Email
									</label>
									<Input
										id="lead-email"
										type="email"
										inputMode="email"
										placeholder="seu@email.com"
										className={cn("w-full min-h-[44px]", errors.email && "border-destructive")}
										{...register("email")}
									/>
									{errors.email && (
										<p className="text-xs text-destructive">{errors.email.message}</p>
									)}
								</div>

								{/* Submit */}
								<Button
									type="submit"
									size="lg"
									disabled={isSubmitting}
									className="w-full min-h-[44px]"
								>
									{isSubmitting ? "Enviando..." : "Enviar dados"}
								</Button>

								{/* Root error */}
								{errors.root && (
									<p className="text-xs text-destructive text-center">{errors.root.message}</p>
								)}
							</form>
						</CardContent>
					</Card>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
