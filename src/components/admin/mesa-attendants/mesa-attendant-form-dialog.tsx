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
import { createMesaAttendantSchema, updateMesaAttendantSchema } from "@/lib/validations/mesa";
import type { MesaAttendant } from "./mesa-attendants-table";

type Mode = "create" | "edit";

interface Props {
	mode: Mode;
	attendant?: MesaAttendant;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

type FormValues = {
	nome: string;
	whatsapp: string;
};

/** Formata progressivamente o telefone BR com DDI conforme digita. */
function formatBRPhone(digits: string): string {
	const d = digits.replace(/\D/g, "").slice(0, 13);
	if (d.length === 0) return "";
	if (d.length <= 2) return `+${d}`;
	if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`;
	if (d.length <= 8) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`;
	if (d.length <= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
	return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
}

export function MesaAttendantFormDialog({ mode, attendant, open, onOpenChange, onSuccess }: Props) {
	const [submitError, setSubmitError] = useState<string | null>(null);

	const resolver = (mode === "create"
		? zodResolver(createMesaAttendantSchema)
		: zodResolver(updateMesaAttendantSchema)) as unknown as Resolver<FormValues>;

	const defaultValues: FormValues =
		mode === "edit" && attendant
			? { nome: attendant.nome, whatsapp: attendant.whatsapp }
			: { nome: "", whatsapp: "" };

	const {
		register,
		handleSubmit,
		reset,
		control,
		formState: { errors, isSubmitting },
	} = useForm<FormValues>({ resolver, defaultValues });

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
			mode === "create"
				? "/api/admin/mesa-attendants"
				: `/api/admin/mesa-attendants/${attendant!.id}`;
		const method = mode === "create" ? "POST" : "PATCH";

		const res = await fetch(url, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ nome: values.nome, whatsapp: values.whatsapp }),
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
						{mode === "create" ? "Adicionar atendente de mesa" : "Editar atendente de mesa"}
					</DialogTitle>
					<DialogDescription>
						Cadastro simples: nome e WhatsApp. O WhatsApp é por onde o copiloto conversa com o
						atendente.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit} className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="nome">Nome</Label>
						<Input
							id="nome"
							type="text"
							autoComplete="name"
							disabled={isSubmitting}
							{...register("nome")}
						/>
						{errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="whatsapp">WhatsApp (com DDI+DDD)</Label>
						<Controller
							name="whatsapp"
							control={control}
							render={({ field }) => (
								<Input
									id="whatsapp"
									type="tel"
									inputMode="tel"
									placeholder="+55 (62) 99999-8888"
									autoComplete="tel"
									disabled={isSubmitting}
									value={formatBRPhone(field.value ?? "")}
									onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 13))}
									onBlur={field.onBlur}
								/>
							)}
						/>
						{errors.whatsapp && (
							<p className="text-sm text-destructive">{errors.whatsapp.message}</p>
						)}
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
							{isSubmitting ? "Salvando…" : mode === "create" ? "Adicionar" : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
