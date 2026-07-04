"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_CATEGORIES } from "@/lib/validations/whatsapp-template";
import type { WhatsappTemplate } from "./templates-table";

type Mode = "create" | "edit";

interface Props {
	mode: Mode;
	template?: WhatsappTemplate;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

const SNAKE_CASE = /^[a-z0-9_]+$/;

const CATEGORY_LABELS: Record<string, string> = {
	UTILITY: "Utilitário (confirmações, atualizações)",
	MARKETING: "Marketing (promoções)",
	AUTHENTICATION: "Autenticação (códigos)",
};

function extractParts(t?: WhatsappTemplate) {
	const comps = t?.components ?? [];
	return {
		header: comps.find((c) => c.type === "HEADER")?.text ?? "",
		body: comps.find((c) => c.type === "BODY")?.text ?? t?.bodyPreview ?? "",
		footer: comps.find((c) => c.type === "FOOTER")?.text ?? "",
	};
}

export function TemplateFormDialog({ mode, template, open, onOpenChange, onSuccess }: Props) {
	// Fora de DRAFT o conteúdo é imutável na Meta; só o vínculo (usageKey) é editável.
	const contentLocked = mode === "edit" && template?.status !== "DRAFT";

	const initial = useMemo(() => {
		const parts = extractParts(template);
		return {
			usageKey: template?.usageKey ?? "",
			metaName: template?.metaName ?? "",
			category: (template?.category ?? "UTILITY") as string,
			language: template?.language ?? "pt_BR",
			header: parts.header,
			body: parts.body,
			footer: parts.footer,
		};
	}, [template]);

	const [values, setValues] = useState(initial);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (open) {
			setValues(initial);
			setErrors({});
			setSubmitError(null);
		}
	}, [open, initial]);

	function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
		setValues((v) => ({ ...v, [key]: value }));
	}

	function validate(): boolean {
		const next: Record<string, string> = {};
		if (values.usageKey.trim() && !SNAKE_CASE.test(values.usageKey.trim())) {
			next.usageKey = "Use apenas letras minúsculas, números e _ (snake_case)";
		}
		if (!contentLocked) {
			if (!values.metaName.trim()) next.metaName = "Obrigatório";
			else if (!SNAKE_CASE.test(values.metaName.trim()))
				next.metaName = "Use apenas letras minúsculas, números e _ (snake_case)";
			if (!values.category) next.category = "Obrigatório";
			if (!values.body.trim()) next.body = "O corpo (BODY) é obrigatório";
		}
		setErrors(next);
		return Object.keys(next).length === 0;
	}

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (!validate()) return;
		setSubmitError(null);
		setSubmitting(true);

		try {
			const url =
				mode === "create"
					? "/api/admin/whatsapp/templates"
					: `/api/admin/whatsapp/templates/${template!.id}`;
			const method = mode === "create" ? "POST" : "PATCH";

			// Fora de DRAFT: só o vínculo. Caso contrário: payload completo.
			const payload = contentLocked
				? { usageKey: values.usageKey }
				: {
						usageKey: values.usageKey,
						metaName: values.metaName,
						category: values.category,
						language: values.language,
						header: values.header,
						body: values.body,
						footer: values.footer,
					};

			const res = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}

			onOpenChange(false);
			onSuccess();
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{mode === "create" ? "Novo template" : "Editar template"}</DialogTitle>
					<DialogDescription>
						{contentLocked
							? "Este template já foi submetido à Meta — o conteúdo é imutável. Você pode ajustar apenas a chave de uso (usageKey)."
							: "O corpo aceita variáveis no formato {{1}}, {{2}}. A chave de uso (usageKey) liga este template a um ponto de disparo e pode ser definida agora ou depois."}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit} className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="usageKey">Chave de uso (opcional)</Label>
						<Input
							id="usageKey"
							placeholder="Ex: confirmacao_contratacao"
							value={values.usageKey}
							onChange={(e) => set("usageKey", e.target.value)}
							disabled={submitting}
						/>
						{errors.usageKey && <p className="text-sm text-destructive">{errors.usageKey}</p>}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="metaName">Nome na Meta</Label>
						<Input
							id="metaName"
							placeholder="Ex: aja_confirmacao_v1"
							value={values.metaName}
							onChange={(e) => set("metaName", e.target.value)}
							disabled={submitting || contentLocked}
						/>
						{errors.metaName && <p className="text-sm text-destructive">{errors.metaName}</p>}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="category">Categoria</Label>
							<Select
								value={values.category}
								onValueChange={(v) => { if (v) set("category", v); }}
								disabled={submitting || contentLocked}
							>
								<SelectTrigger id="category">
									<SelectValue placeholder="Selecione" />
								</SelectTrigger>
								<SelectContent>
									{TEMPLATE_CATEGORIES.map((c) => (
										<SelectItem key={c} value={c}>
											{CATEGORY_LABELS[c] ?? c}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{errors.category && <p className="text-sm text-destructive">{errors.category}</p>}
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="language">Idioma</Label>
							<Input
								id="language"
								placeholder="pt_BR"
								value={values.language}
								onChange={(e) => set("language", e.target.value)}
								disabled={submitting || contentLocked}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="header">Cabeçalho (opcional)</Label>
						<Input
							id="header"
							placeholder="Ex: Aja Agora"
							value={values.header}
							onChange={(e) => set("header", e.target.value)}
							disabled={submitting || contentLocked}
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="body">Corpo (BODY)</Label>
						<Textarea
							id="body"
							rows={4}
							placeholder="Olá {{1}}, sua reserva de cota foi confirmada! 🎉"
							value={values.body}
							onChange={(e) => set("body", e.target.value)}
							disabled={submitting || contentLocked}
						/>
						{errors.body && <p className="text-sm text-destructive">{errors.body}</p>}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="footer">Rodapé (opcional)</Label>
						<Input
							id="footer"
							placeholder="Ex: Time Aja Agora"
							value={values.footer}
							onChange={(e) => set("footer", e.target.value)}
							disabled={submitting || contentLocked}
						/>
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
							disabled={submitting}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? "Salvando…" : mode === "create" ? "Criar rascunho" : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
