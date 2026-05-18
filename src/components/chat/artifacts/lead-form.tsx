"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatContext } from "@/lib/chat/provider";
import type { LeadFormPayload } from "@/lib/chat/types";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { LEAD_FIELDS, type LeadFields, type LeadFieldsInput, leadSchema } from "@/lib/lead/schema";
import { cn } from "@/lib/utils";

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
	const { conversationId, refreshHandoff } = useChatContext();
	const prefersReduced = useReducedMotion();
	const anim = prefersReduced ? reducedMotionEntry : motionEntry;

	const {
		register,
		handleSubmit,
		setError,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<LeadFieldsInput, unknown, LeadFields>({
		resolver: zodResolver(leadSchema),
		// Bug A: prioriza nome já capturado pelo backend no payload —
		// elimina race com fetch tardio em /api/leads/[id] (que deixava
		// o form vazio mesmo com conversations.contactName populado).
		defaultValues: { name: payload.prefilledName ?? "", phone: "", email: "" },
	});

	// Pré-preencher com dados já capturados conversacionalmente (Fase 6).
	// GET /api/leads/[id] retorna { name, phone, email } com strings vazias.
	// Mantido como fallback pra phone/email — nome já vem do payload.
	useEffect(() => {
		const id = conversationId ?? payload.conversationId;
		if (!id) return;
		let cancelled = false;
		void fetch(`/api/leads/${id}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (cancelled || !data) return;
				reset({
					// payload.prefilledName tem prioridade sobre o fetch — só
					// cai pro data.name se o backend não tiver enviado nada.
					name: payload.prefilledName ?? data.name ?? "",
					phone: data.phone ?? "",
					email: data.email ?? "",
				});
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [conversationId, payload.conversationId, payload.prefilledName, reset]);

	const onSubmit = async (data: LeadFields) => {
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

			void refreshHandoff();
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
							<p className="text-sm text-muted-foreground">Para prosseguir com o consórcio</p>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
								{LEAD_FIELDS.map((field, idx) => (
									<div key={field.key} className="space-y-1.5">
										<label
											htmlFor={`lead-${field.key}`}
											className="text-sm font-medium leading-none"
										>
											{field.label}
											{!field.required && (
												<span className="text-muted-foreground"> (opcional)</span>
											)}
										</label>
										<Input
											id={`lead-${field.key}`}
											type={field.type}
											inputMode={field.inputMode}
											placeholder={field.placeholder}
											autoFocus={idx === 0 && field.autoFocus}
											className={cn(
												"w-full min-h-[44px]",
												errors[field.key] && "border-destructive",
											)}
											{...register(field.key)}
										/>
										{errors[field.key] && (
											<p className="text-xs text-destructive">{errors[field.key]?.message}</p>
										)}
									</div>
								))}

								<Button
									type="submit"
									size="lg"
									disabled={isSubmitting}
									className="w-full min-h-[44px]"
								>
									{isSubmitting ? "Enviando..." : "Enviar dados"}
								</Button>

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
