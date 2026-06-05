"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, type Resolver, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	type CreateAttendantInput,
	createAttendantSchema,
	type UpdateAttendantInput,
	updateAttendantSchema,
} from "@/lib/validations/attendant";
import type { Attendant } from "./attendants-table";

type Mode = "create" | "edit";

interface Props {
	mode: Mode;
	attendant?: Attendant;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

type FormValues = {
	name: string;
	email?: string;
	phone: string;
};

/**
 * Format Brazilian phone with country code progressively as the user types.
 * Input: digits only. Output: "+55 (11) 99999-8888" / "+55 (11) 9999-8888".
 */
function formatBRPhone(digits: string): string {
	const d = digits.replace(/\D/g, "").slice(0, 13);
	if (d.length === 0) return "";
	if (d.length <= 2) return `+${d}`;
	if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`;
	if (d.length <= 8) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`;
	if (d.length <= 12) {
		return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
	}
	return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
}

export function AttendantFormDialog({ mode, attendant, open, onOpenChange, onSuccess }: Props) {
	const [submitError, setSubmitError] = useState<string | null>(null);

	const resolver = (mode === "create"
		? zodResolver(createAttendantSchema)
		: zodResolver(updateAttendantSchema)) as unknown as Resolver<FormValues>;

	const defaultValues: FormValues =
		mode === "edit" && attendant
			? { name: attendant.name, email: attendant.email, phone: attendant.phone ?? "" }
			: { name: "", email: "", phone: "" };

	const {
		register,
		handleSubmit,
		reset,
		control,
		formState: { errors, isSubmitting },
	} = useForm<FormValues>({
		resolver,
		defaultValues,
	});

	useEffect(() => {
		if (open) {
			reset(defaultValues);
			setSubmitError(null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, attendant?.id]);

	const onSubmit = handleSubmit(async (values) => {
		setSubmitError(null);

		const url =
			mode === "create" ? "/api/admin/attendants" : `/api/admin/attendants/${attendant!.id}`;
		const method = mode === "create" ? "POST" : "PATCH";

		const payload =
			mode === "create"
				? ({ name: values.name, email: values.email, phone: values.phone } as CreateAttendantInput)
				: ({ name: values.name, phone: values.phone } as UpdateAttendantInput);

		const res = await fetch(url, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			let message = `HTTP ${res.status}`;
			try {
				const body = (await res.json()) as { error?: string };
				if (body.error) message = body.error;
			} catch {
				// ignore parse errors
			}
			setSubmitError(message);
			return;
		}

		onOpenChange(false);
		onSuccess();
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Adicionar atendente" : "Editar atendente"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "O atendente receberá um email com o link para definir a própria senha."
							: "Atualize os dados do atendente."}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit} className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="name">Nome</Label>
						<Input
							id="name"
							type="text"
							autoComplete="name"
							disabled={isSubmitting}
							{...register("name")}
						/>
						{errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
					</div>

					{mode === "create" && (
						<div className="space-y-1.5">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								disabled={isSubmitting}
								{...register("email")}
							/>
							{errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
						</div>
					)}

					<div className="space-y-1.5">
						<Label htmlFor="phone">Telefone (com DDI+DDD)</Label>
						<Controller
							name="phone"
							control={control}
							render={({ field }) => (
								<Input
									id="phone"
									type="tel"
									inputMode="tel"
									placeholder="+55 (11) 99999-8888"
									autoComplete="tel"
									disabled={isSubmitting}
									value={formatBRPhone(field.value ?? "")}
									onChange={(e) => {
										const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
										field.onChange(digits);
									}}
									onBlur={field.onBlur}
								/>
							)}
						/>
						{errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
					</div>

					{submitError && (
						<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
							{submitError}
						</div>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Salvando…" : mode === "create" ? "Enviar convite" : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
