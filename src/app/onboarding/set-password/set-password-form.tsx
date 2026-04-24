"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const formSchema = z
	.object({
		password: z
			.string()
			.min(8, "Senha deve ter pelo menos 8 caracteres")
			.max(128, "Senha deve ter no maximo 128 caracteres"),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "As senhas não conferem",
		path: ["confirmPassword"],
	});

type FormValues = z.infer<typeof formSchema>;

interface Props {
	token: string;
	email: string;
}

export function SetPasswordForm({ token, email }: Props) {
	const router = useRouter();
	const [submitError, setSubmitError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { password: "", confirmPassword: "" },
	});

	const onSubmit = handleSubmit(async (values) => {
		setSubmitError(null);

		const res = await fetch("/api/onboarding/set-password", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, password: values.password }),
		});

		if (!res.ok) {
			let message = `HTTP ${res.status}`;
			try {
				const body = (await res.json()) as { error?: string };
				if (body.error) message = body.error;
			} catch {
				// ignore
			}
			setSubmitError(message);
			return;
		}

		// Sign the user in immediately after password is set.
		const signInResult = await authClient.signIn.email({
			email,
			password: values.password,
		});

		if (signInResult.error) {
			setSubmitError(
				`Senha definida, mas falha ao entrar automaticamente: ${signInResult.error.message ?? "erro"}. Use a tela de login.`,
			);
			return;
		}

		router.push("/admin");
		router.refresh();
	});

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div className="space-y-1.5">
				<Label htmlFor="password">Nova senha</Label>
				<Input
					id="password"
					type="password"
					autoComplete="new-password"
					disabled={isSubmitting}
					{...register("password")}
				/>
				{errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="confirmPassword">Confirmar senha</Label>
				<Input
					id="confirmPassword"
					type="password"
					autoComplete="new-password"
					disabled={isSubmitting}
					{...register("confirmPassword")}
				/>
				{errors.confirmPassword && (
					<p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
				)}
			</div>

			{submitError && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					{submitError}
				</div>
			)}

			<Button type="submit" className="w-full" disabled={isSubmitting}>
				{isSubmitting ? "Ativando…" : "Definir senha e entrar"}
			</Button>
		</form>
	);
}
