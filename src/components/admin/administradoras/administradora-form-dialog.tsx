"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
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
import { createAdministradoraSchema, updateAdministradoraSchema } from "@/lib/validations/mesa";
import type { Administradora } from "./administradoras-table";

type Mode = "create" | "edit";

interface Props {
	mode: Mode;
	administradora?: Administradora;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

type FormValues = {
	nome: string;
	codigoBevi?: string;
};

export function AdministradoraFormDialog({
	mode,
	administradora,
	open,
	onOpenChange,
	onSuccess,
}: Props) {
	const [submitError, setSubmitError] = useState<string | null>(null);

	const resolver = (mode === "create"
		? zodResolver(createAdministradoraSchema)
		: zodResolver(updateAdministradoraSchema)) as unknown as Resolver<FormValues>;

	const defaultValues: FormValues =
		mode === "edit" && administradora
			? { nome: administradora.nome, codigoBevi: administradora.codigoBevi ?? "" }
			: { nome: "", codigoBevi: "" };

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<FormValues>({ resolver, defaultValues });

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset/defaultValues mudam a cada render do useForm; re-sincronizar só na abertura é intencional.
	useEffect(() => {
		if (open) {
			reset(defaultValues);
			setSubmitError(null);
		}
	}, [open, administradora?.id]);

	const onSubmit = handleSubmit(async (values) => {
		setSubmitError(null);
		// `administradora!` escondia o caso real de abrir em modo edição sem objeto
		// (a URL viraria .../undefined e o PATCH morreria em 404 silencioso).
		const editing = mode === "create" ? null : administradora;
		if (mode !== "create" && !editing) {
			setSubmitError("Não foi possível identificar a administradora a editar.");
			return;
		}
		const url = editing ? `/api/admin/administradoras/${editing.id}` : "/api/admin/administradoras";
		const method = editing ? "PATCH" : "POST";

		const res = await fetch(url, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ nome: values.nome, codigoBevi: values.codigoBevi }),
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
						{mode === "create" ? "Adicionar administradora" : "Editar administradora"}
					</DialogTitle>
					<DialogDescription>
						O slug é gerado automaticamente a partir do nome. O código Bevi (opcional) casa a
						administradora com as propostas vindas da Bevi.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit} className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="nome">Nome</Label>
						<Input
							id="nome"
							type="text"
							placeholder="Ex: Canopus"
							disabled={isSubmitting}
							{...register("nome")}
						/>
						{errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="codigoBevi">Código Bevi (opcional)</Label>
						<Input
							id="codigoBevi"
							type="text"
							placeholder="Ex: CANOPUS"
							disabled={isSubmitting}
							{...register("codigoBevi")}
						/>
						{errors.codigoBevi && (
							<p className="text-sm text-destructive">{errors.codigoBevi.message}</p>
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
