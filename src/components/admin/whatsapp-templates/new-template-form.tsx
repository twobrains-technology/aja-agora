"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

export function NewWhatsAppTemplateForm() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [category, setCategory] = useState<"UTILITY" | "MARKETING" | "AUTHENTICATION">("UTILITY");
	const [bodyText, setBodyText] = useState("");
	const [footerText, setFooterText] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [aiPrompt, setAiPrompt] = useState("");
	const [aiLoading, setAiLoading] = useState(false);
	const [aiError, setAiError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const placeholders = useMemo(() => {
		const set = new Set<string>();
		for (const m of bodyText.matchAll(/\{\{(\d+)\}\}/g)) set.add(m[1]);
		return Array.from(set).sort();
	}, [bodyText]);

	async function handleSave(submitNow: boolean) {
		setError(null);
		setSubmitting(true);
		try {
			const res = await fetch("/api/admin/whatsapp-templates", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name,
					category,
					language: "pt_BR",
					bodyText,
					footerText: footerText || undefined,
					submitNow,
				}),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(data.error ?? `HTTP ${res.status}`);
			}
			router.push("/admin/whatsapp-templates");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setSubmitting(false);
		}
	}

	async function generateWithAi() {
		if (!aiPrompt.trim()) return;
		setAiLoading(true);
		setAiError(null);
		try {
			const res = await fetch("/api/admin/whatsapp-templates/ai-suggest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: aiPrompt }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as {
				name?: string;
				category?: "UTILITY" | "MARKETING" | "AUTHENTICATION";
				bodyText?: string;
				footerText?: string;
			};
			if (data.name) setName(data.name);
			if (data.category) setCategory(data.category);
			if (data.bodyText) setBodyText(data.bodyText);
			if (data.footerText) setFooterText(data.footerText);
		} catch (e) {
			setAiError(e instanceof Error ? e.message : String(e));
		} finally {
			setAiLoading(false);
		}
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[1fr_360px]">
			<div className="space-y-4">
				{/* AI Builder */}
				<div className="rounded-lg border bg-muted/30 p-4 space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Sparkles className="size-4" /> Gerar com IA
					</div>
					<p className="text-xs text-muted-foreground">
						Descreva a mensagem em português que você quer mandar. A IA gera o body, categoria e
						nome.
					</p>
					<Textarea
						value={aiPrompt}
						onChange={(e) => setAiPrompt(e.target.value)}
						placeholder='Ex: "Lembrete amigável pra leads que simularam mas não fecharam, oferecendo retomar a conversa."'
						rows={2}
					/>
					<div className="flex items-center gap-2">
						<Button onClick={generateWithAi} disabled={aiLoading || !aiPrompt.trim()}>
							{aiLoading ? "Gerando..." : "Gerar"}
						</Button>
						{aiError ? <span className="text-xs text-destructive">{aiError}</span> : null}
					</div>
				</div>

				{/* Form */}
				<div className="space-y-3">
					<div className="space-y-1">
						<Label htmlFor="name">Nome (snake_case)</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
							placeholder="lembrete_simulacao"
						/>
					</div>

					<div className="space-y-1">
						<Label>Categoria</Label>
						<Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="UTILITY">UTILITY (lembrete, follow-up)</SelectItem>
								<SelectItem value="MARKETING">MARKETING (promocional)</SelectItem>
								<SelectItem value="AUTHENTICATION">AUTHENTICATION (OTP)</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1">
						<Label htmlFor="body">
							Body{" "}
							<span className="text-xs text-muted-foreground">
								(use {`{{1}}`}, {`{{2}}`} para placeholders)
							</span>
						</Label>
						<Textarea
							id="body"
							value={bodyText}
							onChange={(e) => setBodyText(e.target.value)}
							rows={6}
							placeholder="Olá {{1}}, vimos que você simulou um plano. Quer retomar?"
						/>
						{placeholders.length > 0 ? (
							<p className="text-xs text-muted-foreground">
								{placeholders.length} placeholder(s):{" "}
								{placeholders.map((p) => `{{${p}}}`).join(", ")}
							</p>
						) : null}
					</div>

					<div className="space-y-1">
						<Label htmlFor="footer">Footer (opcional, máx 60 chars)</Label>
						<Input
							id="footer"
							value={footerText}
							onChange={(e) => setFooterText(e.target.value.slice(0, 60))}
							placeholder="Aja Agora — sua jornada de consórcio"
						/>
					</div>

					{error ? (
						<div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
							{error}
						</div>
					) : null}

					<div className="flex items-center gap-2 pt-2">
						<Button
							variant="outline"
							onClick={() => handleSave(false)}
							disabled={submitting || !name || !bodyText}
						>
							Salvar como rascunho
						</Button>
						<Button onClick={() => handleSave(true)} disabled={submitting || !name || !bodyText}>
							Salvar e submeter à Meta
						</Button>
					</div>
				</div>
			</div>

			{/* Preview WhatsApp bubble */}
			<div className="space-y-2">
				<Label>Preview</Label>
				<div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
					<div className="rounded-lg bg-white shadow-sm">
						<div className="px-3 py-2 text-sm whitespace-pre-wrap">
							{bodyText || (
								<span className="text-muted-foreground italic">(preview do body aparece aqui)</span>
							)}
						</div>
						{footerText ? (
							<div className="border-t border-muted px-3 py-1.5 text-xs text-muted-foreground">
								{footerText}
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
